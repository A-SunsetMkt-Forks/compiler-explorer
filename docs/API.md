# RESTful API

There's a simple restful API that can be used to do compiles to asm and to list compilers. In general all handlers live
in `/api/*` endpoints, will accept JSON or text in POSTs, and will return text or JSON responses depending on the
request's `Accept` header. To receive JSON responses, include `Accept: application/json` in your request headers; 
otherwise responses will be returned in plain text format.

At a later date there may be some form of rate-limiting: currently, requests will be queued and dealt with in the same
way interactive requests are done for the main site. Authentication might be required at some point in the future (for
the main **Compiler Explorer** site anyway).

## Endpoints

### `GET /api/languages` - return a list of languages

Returns a list of the currently supported languages, as pairs of languages IDs and their names.

### `GET /api/compilers` - return a list of compilers

Returns a list of compilers. In text form, there's a simple formatting of the ID of the compiler, its description and
its language ID. In JSON, all the information is returned as an array of compilers, with the `id` key being the primary
identifier of each compiler.

Due to the amount of compilers and information available through this api call, by default you will only get these
fields per compiler: `['id', 'name', 'lang', 'compilerType', 'semver', 'extensions', 'monaco']`

If you require different fields, you can specify them by adding `?fields=field1,field2,field3` to your query.

To see all the available fields, you can use `?fields=all`. It is not recommended using this by default.

### `GET /api/compilers/<language-id>` - return a list of compilers with matching language

Returns a list of compilers for the provided language id. In text form, there's a simple formatting of the ID of the
compiler, its description and its language ID. In JSON, all the information is returned as an array of compilers, with
the `id` key being the primary identifier of each compiler.

The same field restrictions apply as with `GET /api/compilers`

### `GET /api/libraries/<language-id>` - return a list of libraries available with for a language

Returns a list of libraries and library versions available for the provided language id. This request only returns data
in JSON.

You can use the given include paths to supply in the userArguments for compilation. _(deprecated)_

You will need the library id's, and the version id's to supply to **compile** if you want to include libraries during
compilation.

### `GET /api/tools/<language-id>` - return a list of tools available for a language

Returns a list of tools available for the provided language id. This request only returns data in JSON.

The response contains an array of tool objects, each with:
- `id`: Tool identifier
- `name`: Human-readable tool name  
- `type`: Tool type (e.g., "postprocessor")
- `languageId`: Language the tool supports
- `allowStdin`: Boolean indicating if the tool accepts stdin input

You can use the tool id's in the `tools` array when making compilation requests.

### `GET /api/shortlinkinfo/<linkid>` - return information about a given link

Returns information like Sourcecode, Compiler settings and libraries for a given link id. This request only returns data
in JSON.

### `POST /api/compiler/<compiler-id>/compile` - perform a compilation

To specify a compilation request as a JSON document, post it as the appropriate type and send an object of the form:

```JSON
{
    "source": "<Source-to-compile>",
    "options": {
        "userArguments": "<Compiler-flags>",
        "compilerOptions": {
              "skipAsm": false,
              "executorRequest": false,
              "overrides": []
        },
        "filters": {
             "binary": false,
             "binaryObject": false,
             "commentOnly": true,
             "demangle": true,
             "directives": true,
             "execute": false,
             "intel": true,
             "labels": true,
             "libraryCode": false,
             "trim": false,
             "debugCalls": false
        },
        "tools": [
             {"id":"clangtidytrunk", "args":"-checks=*"}
        ],
        "libraries": [
             {"id": "range-v3", "version": "trunk"},
             {"id": "fmt", "version": "400"}
        ],
        "executeParameters": {
            "args": [],
            "stdin": "",
            "runtimeTools": []
        }
    },
    "lang": "<lang-id (Optional)>",
    "allowStoreCodeDebug": true,
    "files": [
        {
            "filename": "myheader.h",
            "contents": "#define MY_CONSTANT 42"
        }
    ]
}
```

Execution Only request example:

```JSON
{
    "source": "int main () { return 1; }",
    "compiler": "g82",
    "options": {
        "userArguments": "-O3",
        "executeParameters": {
            "args": ["arg1", "arg2"],
            "stdin": "hello, world!",
            "runtimeTools": [
              {
                "name": "env",
                "options": [
                  {
                    "name": "MYENV",
                    "value": "123"
                  }
                ]
              }
            ]
        },
        "compilerOptions": {
            "executorRequest": true
        },
        "filters": {
            "execute": true
        },
        "tools": [],
        "libraries": [
            {"id": "openssl", "version": "111c"}
        ]
    },
    "lang": "c++",
    "allowStoreCodeDebug": true
}
```

The filters are a JSON object with `true`/`false` values. If not supplied, defaults are used. If supplied, the provided
filters override their default values. The `compilerOptions` is used to pass extra arguments to the back end, and is
probably not useful for most REST users.

To force a cache bypass, `bypassCache` can be set. This accepts an enum value according to:

```ts
export enum BypassCache {
  None = 0,
  Compilation = 1,
  Execution = 2,
}
```

If bypass compile cache is specified and an execution is to happen, the execution cache will also be bypassed.

Note: `bypassCache` previously accepted a boolean. The enum values have been carefully chosen for backwards
compatibility.

Filters include `binary`, `binaryObject`, `labels`, `intel`, `directives`, `demangle`, `commentOnly`, `execute`, `libraryCode`, `trim`, and `debugCalls`, which correspond to the UI buttons on the HTML version.

With the tools array you can ask CE to execute certain tools available for the current compiler, and also supply
arguments for this tool.

Libraries can be marked to have their directories available when including their header files. The can be listed by
supplying the library ids and versions in an array. The id's to supply can be found with the
`/api/libraries/<language-id>`

The `files` array allows you to provide additional source files for multi-file compilation. Each file is an object with:
- `filename`: The name of the file (e.g., "myheader.h", "utils.cpp")
- `contents`: The source code contents of the file

Note that using external header files of the type:

```
#include <https://some-url.to/a-file.h>
```

is not supported for this endpoint for security reasons.

The feature for the site is handled client-side, as the compilation nodes have no internet access.

### `POST /api/compiler/<compiler-id>/cmake` - perform a CMake compilation

This endpoint allows you to compile CMake projects. The request must be a JSON document with the following structure:

```JSON
{
    "source": "cmake_minimum_required(VERSION 3.10)\nproject(MyProject)\nadd_executable(main main.cpp)",
    "files": [
        {
            "filename": "main.cpp",
            "contents": "#include <iostream>\nint main() { std::cout << \"Hello, World!\" << std::endl; return 0; }"
        }
    ],
    "options": {
        "userArguments": "<Compiler-flags>",
        "compilerOptions": {
            "executorRequest": false,
            "cmakeArgs": "<CMake-specific-arguments>",
            "customOutputFilename": "<custom-output-name>"
        },
        "filters": {
            "binary": false,
            "execute": false,
            // ... other filters
        },
        "tools": [],
        "libraries": []
    },
    "bypassCache": 0
}
```

The `source` field contains the contents of your `CMakeLists.txt` file. The `files` array contains all additional source files for your CMake project. Each file must have:
- `filename`: The name of the file
- `contents`: The source code contents of the file

Important parameters:
- `userArguments`: Compiler flags passed to the C++ compiler (not CMake)
- `compilerOptions.cmakeArgs`: Arguments passed directly to CMake (e.g., "-DCMAKE_BUILD_TYPE=Release")
- `compilerOptions.customOutputFilename`: Custom name for the output executable

The response will include the compilation results similar to the regular compile endpoint.

### `GET /api/formats` - return available code formatters

Returns a list of code formatters. The API returns an array of formatter objects which have the following object
structure:

```JSON
{
    "exe": "/opt/compiler-explorer/rustfmt-1.4.36/rustfmt",
    "version": "rustfmt 1.4.36-nightly (7de6968 2021-02-07)",
    "name": "rustfmt",
    "styles": [],
    "type": "rustfmt"
}
```

The name property corresponds to the `<formatter>` when requesting `POST /api/format/<formatter>`. The `type` key in the
JSON request corresponds to one of the `formatters.<key>.type` found in the compiler-explorer configuration properties
(see [Configuration.md](Configuration.md) for more details)

### `POST /api/format/<formatter>` - perform a formatter run

Formats a piece of code according to the given base style using the provided formatter. Be aware that this endpoint only
accepts JSON (e.g `content-type: application/json`).

Formatters available can be found with `GET /api/formats`

```JSON
{
    "source": "int main(     ) {}",
    "base": "Google",
    "useSpaces": false,
    "tabWidth": 4
}
```

The returned JSON body has the following object structure:

```JSON
{
    "answer": "int main() {}",
    "exit": 0
}
```

In cases of internal code formatter failure an additional field named `throw` is also provided and set to true.

### `GET /api/asm/<instructionSet>/<opcode>` - get documentation for an opcode

Returns documentation for given `opcode` in an `instructionSet` (an attribute of a compiler).

```JSON
{
  "tooltip": "Load SIMD&FP Register (immediate offset). This instruction loads an element from memory, and writes the result as a scalar to the SIMD&FP register. The address that is used for the load is calculated from a base register value, a signed immediate offset, and an optional offset that is a multiple of the element size.",
  "html": "<p>Load SIMD&amp;FP Register (immediate offset). This instruction loads an element from memory, and writes the result as a scalar to the SIMD&amp;FP register. The address that is used for the load is calculated from a base register value, a signed immediate offset, and an optional offset that is a multiple of the element size.</p><p>Depending on the settings in the <xref linkend=\"AArch64.cpacr_el1\">CPACR_EL1</xref>, <xref linkend=\"AArch64.cptr_el2\">CPTR_EL2</xref>, and <xref linkend=\"AArch64.cptr_el3\">CPTR_EL3</xref> registers, and the current Security state and Exception level, an attempt to execute the instruction might be trapped.</p>",
  "url": "https://developer.arm.com/documentation/ddi0602/latest/Base-Instructions/"
}
```

In non-JSON version, this endpoint returns only the documentation in HTML format.

### `GET /api/version` - get compiler explorer version

Returns the Git release name of the Compiler Explorer instance.

### `GET /api/releaseBuild` - get release build number

Returns the release build number of the Compiler Explorer instance.

# Non-REST API's

### `POST /api/compiler/<compiler-id>/compile` - perform a compilation

This is same endpoint as for compilation using JSON.

A text compilation request has the source as the body of the post, and uses query parameters to pass the options and
filters. Filters are supplied as a comma-separated string. Use the query parameter `filters=XX` to set the filters
directly, else `addFilters=XX` to add a filter to defaults, or `removeFilters` to remove from defaults. Compiler
parameters should be passed as `options=-O2` and default to empty.

The text request is designed for simplicity for command-line clients like `curl`

```bash
$ curl 'https://godbolt.org/api/compiler/g63/compile?options=-Wall' --data-binary 'int foo() { return 1; }'
# Compilation provided by Compiler Explorer at godbolt.org
foo():
        push    rbp
        mov     rbp, rsp
        mov     eax, 1
        pop     rbp
        ret
```

If JSON is present in the request's `Accept` header, the compilation results are of the form:

(_Optional values are marked with a `**`_)

```javascript
{
  "code": 0 if successful, else compiler return code,
  "stdout": [
            {
              "text": Output,
              ** "tag": {
                          "line": Source line,
                          "text": Parsed error for that line
                 }
            },
            ...
  ],
  "stderr": (format is similar to that of stdout),
  "asm": [
         {
           "text": Assembly text,
           "source": {file: null for user input, else path, line: number} or null if none
         },
         ...
  ],
  "tools": [],
  "okToCache": true if output could be locally cached else false,
  ** "optOutput" : {
                     "displayString" : String displayed in output,
                     "Pass" : [ Missed | Passed | Analysis ] (Specifies the type of optimisation output),
                     "Name" : Name of the output (mostly represents the reason for the output),
                     "DebugLoc" : {
                        "File": Name of file,
                        "Line": Line number,
                        "Column": Column number in line
                     },
                     "Function": Name of function for which optimisation output is provided,
                     "Args": Array of objects representing the arguments that the optimiser used when trying to optimise
     }
}
```

### `POST /api/shortener` - saves given state _forever_ to a shortlink and returns the unique id for the link

The body of this post should be in the format of a [ClientState](../lib/clientstate.ts) Be sure that the Content-Type of
your post is application/json

**⚠️ Important: Shell Escaping**

When using curl with inline JSON, be careful of shell escaping issues. C++ code containing `<`, `>`, `&`, or other special characters can cause problems. **Recommended approach: save JSON to a file and use `--data-binary @filename`**.

An example of one the easiest forms of a clientstate:

```JSON
{
  "sessions": [
    {
      "id": 1,
      "language": "c++",
      "source": "int main() { return 42; }",
      "compilers": [
        {
          "id": "g82",
          "options": "-O3"
        }
      ],
      "executors": [
        {
          "arguments": "arg1",
          "compiler": {
              "id": "g92",
              "libs": [],
              "options": "-O3"
          },
          "stdin": ""
        }
      ]
    }
  ]
}
```

**Usage Examples:**

```bash
# Method 1: File-based (recommended for complex code)
curl -X POST -H "Content-Type: application/json" \
  --data-binary @payload.json \
  "https://godbolt.org/api/shortener"

# Method 2: Inline JSON (escape shell characters carefully)
curl -X POST -H "Content-Type: application/json" \
  -d '{"sessions":[{"id":1,"language":"c++","source":"int main() { return 42; }","compilers":[{"id":"g82","options":"-O3"}]}]}' \
  "https://godbolt.org/api/shortener"
```

**Common Issues:**
- If you get "Bad escaped character in JSON at position X" errors, it's often a shell escaping issue, not invalid JSON
- C++ template syntax (`<`, `>`) and operators (`&`, `|`) need careful escaping in shells
- Use the file-based approach to avoid these issues entirely

Returns:

```JSON
{
    "url": "https://godbolt.org/z/Km_340"
}
```

The storedId can be used in the api call `/api/shortlinkinfo/<id>` and to open in the website with a `/z/<id>`
shortlink.

### `GET /z/<id>` - Opens the website from a shortlink

This call opens the website in a state that was previously saved using the built-in shortener.

### `GET /z/<id>/code/<sourceid>` - Returns just the sourcecode from a shortlink

This call returns plain/text for the code that was previously saved using the built-in shortener.

If there were multiple editors during the saved session, you can retrieve them by setting `<sourceid>` to 1, 2, 3,
etcetera, otherwise `<sourceid>` can be set to 1.

### `GET /clientstate/<base64>` - Opens the website in a given state

This call is to open the website with a given state (without having to store the state first with /api/shortener)
Instead of sending the ClientState JSON in the post body, it will have to be encoded with base64 and attached directly
onto the URL. It is possible to compress the JSON string with the zlib deflate method (compression used by gzip;
available for many programming languages like [javascript](https://nodejs.org/api/zlib.html)). It is automatically
detected.

To avoid problems in reading base64 by the API, some characters must be kept in unicode. Therefore, before calling the
API, it is necessary to replace these characters with their respective unicodes. A suggestion is to use the Regex
expression `/[\u007F-\uFFFF]/g` that allows mapping these characters.

# Implementations

Here are some examples of projects using the Compiler Explorer API:

- [Commandline CE by ethanhs](https://github.com/ethanhs/cce) (Rust)
- [VIM plugin by ldrumm](https://github.com/ldrumm/compiler-explorer.vim)
- [API in Delphi by partouf](https://github.com/partouf/compilerexplorer-api) (Delphi)
- [QTCreator Plugin by dobokirisame](https://github.com/dobokirisame/CompilerExplorer) (C++)
- [CLion plugin by ogrebenyuk](https://github.com/ogrebenyuk/compilerexplorer) (Java)
- [QCompilerExplorer - frontend in Qt](https://github.com/Waqar144/QCompilerExplorer) (C++)
- [Emacs client - compiler-explorer.el](https://github.com/mkcms/compiler-explorer.el)
- [compiler-explorer.nvim by krady21](https://github.com/krady21/compiler-explorer.nvim) (Lua)
- [ForCompile](https://github.com/gha3mi/forcompile) - A Fortran library to access the API by
  [gha3mi](https://github.com/gha3mi) (Fortran)
