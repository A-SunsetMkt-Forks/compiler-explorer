// Copyright (c) 2018, Filipe Cabecinhas
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

import {beforeAll, describe, expect, it} from 'vitest';

import {CompilationEnvironment} from '../lib/compilation-env.js';
import {AnalysisTool, LLVMmcaTool} from '../lib/compilers/index.js';
import {ToolEnv} from '../lib/tooling/base-tool.interface.js';
import {LLVMMcaTool as LLVMMcaTooling} from '../lib/tooling/llvm-mca-tool.js';
import {ToolInfo} from '../types/tool.interfaces.js';

import {
    makeCompilationEnvironment,
    makeFakeCompilerInfo,
    makeFakeParseFiltersAndOutputOptions,
    shouldExist,
} from './utils.js';

const languages = {
    analysis: {id: 'analysis'},
} as const;

describe('LLVM-mca tool definition', () => {
    let ce: CompilationEnvironment;
    let a: LLVMmcaTool;

    beforeAll(() => {
        ce = makeCompilationEnvironment({languages});
        const info = makeFakeCompilerInfo({
            remote: {
                target: 'foo',
                path: 'bar',
                cmakePath: 'cmake',
                basePath: '/',
            },
            lang: languages.analysis.id,
        });
        a = new LLVMmcaTool(info, ce);
    });

    it('should have most filters disabled', () => {
        if (shouldExist(a)) {
            expect(a.getInfo().disabledFilters).toEqual(['labels', 'directives', 'commentOnly', 'trim', 'debugCalls']);
        }
    });

    it('should default to most filters off', () => {
        const filters = a.getDefaultFilters();
        expect(filters.intel).toBe(true);
        expect(filters.commentOnly).toBe(false);
        expect(filters.directives).toBe(false);
        expect(filters.labels).toBe(false);
        expect(filters.optOutput).toBe(false);
        expect(filters.debugCalls).toBe(false);
    });

    it('should not support objdump', () => {
        expect(a.supportsObjdump()).toBe(false);
    });

    it('should support "-o output-file" by default', () => {
        const opts = a.optionsForFilter(
            makeFakeParseFiltersAndOutputOptions({
                commentOnly: false,
                labels: true,
            }),
            'output.txt',
        );
        expect(opts).toEqual(['-o', 'output.txt']);
    });

    it('should split if disabledFilters is a string', () => {
        const info = makeFakeCompilerInfo({
            remote: {
                target: 'foo',
                path: 'bar',
                cmakePath: 'cmake',
                basePath: '/',
            },
            lang: 'analysis',
            disabledFilters: 'labels,directives,debugCalls' as any,
        });
        expect(new AnalysisTool(info, ce).getInfo().disabledFilters).toEqual(['labels', 'directives', 'debugCalls']);
    });

    it('should remove .loc and .file directives from assembly', () => {
        const mcaTool = new LLVMMcaTooling({} as ToolInfo, {} as ToolEnv);

        const asmWithDebugInfo = '.file "test.c"\n.loc 1 1 12\nmovl $2, %eax\n.file 0 "/path" "test.c"\nret\n';
        const result = mcaTool.rewriteAsm(asmWithDebugInfo);

        // Verify that .loc and .file directives are removed
        expect(result).not.toContain('.loc');
        expect(result).not.toContain('.file');
        expect(result).toContain('movl $2, %eax');
        expect(result).toContain('ret');
    });
});
