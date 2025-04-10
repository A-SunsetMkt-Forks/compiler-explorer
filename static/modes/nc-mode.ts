// Copyright (c) 2018, Compiler Explorer Authors
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
//     * Redistributions of source code must retain the above copyright notice,
//       this list of conditions and the following disclaimer.
//     * Redistributions in binary form must reproduce the above copyright
//       notice, this list of conditions and the following disclaimer in the
//       documentation and/or other materials provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

import $ from 'jquery';

import * as monaco from 'monaco-editor';

// @ts-ignore  "Could not find a declaration file"
import * as cpp from 'monaco-editor/esm/vs/basic-languages/cpp/cpp';

// We need to ensure we use proper keywords for the Monaco Editor matcher. Note how
// https://github.com/Microsoft/monaco-languages/ lacks, as far as I can tell, proper C support. We cheat and use C++
function definition(): monaco.languages.IMonarchLanguage {
    const nc = $.extend(true, {}, cpp.language); // deep copy
    // https://en.cppreference.com/w/c/keyword
    nc.keywords = [
        'alignas', // (C23)
        'alignof', // (C23)
        'auto',
        'bool', // (C23)
        'break',
        'case',
        'char',
        'const',
        'constexpr', // (C23)
        'continue',
        'default',
        'do',
        'double',
        'else',
        'enum',
        'extern',
        'false', // (C23)
        'float',
        'for',
        'goto',
        'if',
        'inline', // (C99)
        'int',
        'long',
        'nullptr', // (C23)
        'register',
        'restrict', // (C99)
        'return',
        'short',
        'signed',
        'sizeof',
        'static',
        'static_assert', // (C23)
        'struct',
        'switch',
        'thread_local', // (C23)
        'true', // (C23)
        'typedef',
        'typeof', // (C23)
        'typeof_unqual', // (C23)
        'union',
        'unsigned',
        'void',
        'volatile',
        'while',
        '_Alignas', // (C11)
        '_Alignof', // (C11)
        '_Atomic', // (C11)
        '_BitInt', // (C23)
        '_Bool', // (C99)
        '_Complex', // (C99)
        '_Decimal128', // (C23)
        '_Decimal32', // (C23)
        '_Decimal64', // (C23)
        '_Generic', // (C11)
        '_Imaginary', // (C99)
        '_Noreturn', // (C11)
        '_Static_assert', // (C11)
        '_Thread_local', // (C11)
    ];
    return nc;
}

const def = definition();

monaco.languages.register({id: 'nc'});
monaco.languages.setLanguageConfiguration('nc', cpp.conf);
monaco.languages.setMonarchTokensProvider('nc', def);

export default def;
