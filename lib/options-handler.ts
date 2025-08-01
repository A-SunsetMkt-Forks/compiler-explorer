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

import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import semverParser from 'semver';
import _ from 'underscore';
import urlJoin from 'url-join';

import {splitArguments} from '../shared/common-utils.js';
import {getRemoteId} from '../shared/remote-utils.js';
import {CompilerInfo, Remote} from '../types/compiler.interfaces.js';
import type {LanguageKey} from '../types/languages.interfaces.js';
import type {Source} from '../types/source.interfaces.js';
import type {ToolTypeKey} from '../types/tool.interfaces.js';
import {AppArguments} from './app.interfaces.js';
import {logger} from './logger.js';
import {ClientOptionsSource} from './options-handler.interfaces.js';
import type {PropertyGetter, PropertyValue} from './properties.interfaces.js';
import {CompilerProps} from './properties.js';
import {BaseTool, getToolTypeByKey} from './tooling/index.js';
import {asSafeVer, getHash, splitIntoArray} from './utils.js';

// TODO: Figure out if same as libraries.interfaces.ts?
export type VersionInfo = {
    name?: string;
    version: string;
    staticliblink: string[];
    alias: string[];
    dependencies: string[];
    path: string[];
    libpath: string[];
    liblink: string[];
    lookupname?: PropertyValue;
    lookupversion?: PropertyValue;
    options: string[];
    hidden: boolean;
    packagedheaders?: boolean;
    $order?: number;
};
export type OptionsHandlerLibrary = {
    name: string;
    url: string;
    description: string;
    staticliblink: string[];
    liblink: string[];
    dependencies: string[];
    versions: Record<string, VersionInfo>;
    examples: string[];
    options: string[];
    packagedheaders?: boolean;
};

// TODO: Is this the same as Options in static/options.interfaces.ts?
export type ClientOptionsType = {
    sharingEnabled: boolean;
    githubEnabled: boolean;
    showSponsors: boolean;
    urlShortenService: string;
    defaultSource: string;
    compilers: CompilerInfo[];
    libs: Record<string, Record<string, OptionsHandlerLibrary>>;
    remoteLibs: Record<any, any>;
    tools: Record<any, any>;
    defaultLibs: Record<LanguageKey, string>;
    defaultCompiler: Record<LanguageKey, string>;
    compileOptions: Record<LanguageKey, string>;
    supportsBinary: Record<LanguageKey, boolean>;
    supportsBinaryObject: Record<LanguageKey, boolean>;
    supportsExecute: boolean;
    supportsLibraryCodeFilter: boolean;
    languages: Record<string, any>;
    sources: {
        name: string;
        urlpart: string;
    }[];
    sentryDsn: string;
    sentryEnvironment: string | number | true;
    release: string;
    gitReleaseCommit: string;
    cookieDomainRe: string;
    localStoragePrefix: PropertyValue;
    cvCompilerCountMax: number;
    defaultFontScale: number;
    doCache: boolean;
    thirdPartyIntegrationEnabled: boolean;
    statusTrackingEnabled: boolean;
    compilerVersionsUrl?: string;
    policies: {
        cookies: {
            enabled: boolean;
            key: string;
        };
        privacy: {
            enabled: boolean;
            key: string;
        };
    };
    motdUrl: string;
    pageloadUrl: string;
};

/***
 * Handles the setup of the options object passed on each page request
 */
export class ClientOptionsHandler implements ClientOptionsSource {
    compilerProps: CompilerProps['get'];
    ceProps: PropertyGetter;
    supportsBinary: Record<LanguageKey, boolean>;
    supportsBinaryObject: Record<LanguageKey, boolean>;
    supportsExecutePerLanguage: Record<LanguageKey, boolean>;
    supportsExecute: boolean;
    supportsLibraryCodeFilterPerLanguage: Record<LanguageKey, boolean>;
    supportsLibraryCodeFilter: boolean;
    remoteLibs: Record<any, any>;
    options: ClientOptionsType;
    optionsJSON: string;
    optionsHash: string;
    /***
     *
     * @param {Object[]} fileSources - Files to show in the Load/Save pane
     * @param {string} fileSources.name - UI display name of the file
     * @param {string} fileSources.urlpart - Relative url path to fetch the file from
     * @param {CompilerProps} compilerProps
     * @param {Object} defArgs - Compiler Explorer arguments
     */
    constructor(fileSources: Source[], compilerProps: CompilerProps, defArgs: AppArguments) {
        this.compilerProps = compilerProps.get.bind(compilerProps);
        this.ceProps = compilerProps.ceProps;
        const ceProps = compilerProps.ceProps;
        const sources = _.sortBy(
            fileSources.map(source => {
                return {name: source.name, urlpart: source.urlpart};
            }),
            'name',
        );

        /***
         * @type {CELanguages}
         */
        const languages = compilerProps.languages;

        this.supportsBinary = this.compilerProps(languages, 'supportsBinary', true, res => !!res);
        this.supportsBinaryObject = this.compilerProps(languages, 'supportsBinaryObject', true, res => !!res);
        this.supportsExecutePerLanguage = this.compilerProps(languages, 'supportsExecute', true, res => !!res);
        this.supportsExecute = Object.values(this.supportsExecutePerLanguage).some(Boolean);

        this.supportsLibraryCodeFilterPerLanguage = this.compilerProps(languages, 'supportsLibraryCodeFilter', false);
        this.supportsLibraryCodeFilter = Object.values(this.supportsLibraryCodeFilterPerLanguage).some(Boolean);

        const libs = this.parseLibraries(this.compilerProps<string>(languages, 'libs'));
        const tools = this.parseTools(this.compilerProps<string>(languages, 'tools'));

        this.remoteLibs = {};

        const cookiePolicyEnabled = !!ceProps('cookiePolicyEnabled');
        const privacyPolicyEnabled = !!ceProps('privacyPolicyEnabled');
        const cookieDomainRe = ceProps('cookieDomainRe', '');
        this.options = {
            sharingEnabled: ceProps('clientSharingEnabled', true),
            githubEnabled: ceProps('clientGitHubRibbonEnabled', true),
            showSponsors: ceProps('showSponsors', false),
            urlShortenService: ceProps('urlShortenService', 'default'),
            defaultSource: ceProps('defaultSource', ''),
            compilers: [],
            libs: libs,
            remoteLibs: {},
            tools: tools,
            defaultLibs: this.compilerProps(languages, 'defaultLibs', ''),
            defaultCompiler: this.compilerProps(languages, 'defaultCompiler', ''),
            compileOptions: this.compilerProps(languages, 'defaultOptions', ''),
            supportsBinary: this.supportsBinary,
            supportsBinaryObject: this.supportsBinaryObject,
            supportsExecute: this.supportsExecute,
            supportsLibraryCodeFilter: this.supportsLibraryCodeFilter,
            languages: languages,
            sources: sources,
            sentryDsn: ceProps('sentryDsn', ''),
            sentryEnvironment: ceProps('sentryEnvironment') || defArgs.env[0],
            release: defArgs.releaseBuildNumber || defArgs.gitReleaseName,
            gitReleaseCommit: defArgs.gitReleaseName || '',
            cookieDomainRe,
            localStoragePrefix: ceProps('localStoragePrefix'),
            cvCompilerCountMax: ceProps('cvCompilerCountMax', 6),
            defaultFontScale: ceProps('defaultFontScale', 14),
            doCache: defArgs.doCache,
            thirdPartyIntegrationEnabled: ceProps('thirdPartyIntegrationEnabled', true),
            compilerVersionsUrl: ceProps<string | undefined>('compilerVersionsUrl', undefined),
            statusTrackingEnabled: ceProps('statusTrackingEnabled', true),
            policies: {
                cookies: {
                    enabled: cookiePolicyEnabled,
                    key: 'cookie_status',
                },
                privacy: {
                    enabled: privacyPolicyEnabled,
                    key: 'privacy_status',
                },
            },
            motdUrl: ceProps('motdUrl', ''),
            pageloadUrl: ceProps('pageloadUrl', ''),
        };
        // Will be immediately replaced with actual values
        this.optionsJSON = '';
        this.optionsHash = '';
        this._updateOptionsHash();
    }

    parseTools(baseTools: Record<string, string>) {
        const tools: Record<string, Record<string, BaseTool>> = {};
        for (const [lang, forLang] of Object.entries(baseTools)) {
            if (lang && forLang) {
                tools[lang] = {};
                for (const tool of forLang.split(':')) {
                    const toolBaseName = `tools.${tool}`;
                    const className = this.compilerProps<string>(lang, toolBaseName + '.class');
                    const Tool = getToolTypeByKey(className);

                    const toolPath = this.compilerProps<string>(lang, toolBaseName + '.exe');
                    if (fs.existsSync(toolPath)) {
                        tools[lang][tool] = new Tool(
                            {
                                id: tool,
                                name: this.compilerProps<string>(lang, toolBaseName + '.name'),
                                type: this.compilerProps<string>(lang, toolBaseName + '.type') as ToolTypeKey,
                                exe: toolPath,
                                exclude: splitIntoArray(this.compilerProps<string>(lang, toolBaseName + '.exclude')),
                                includeKey: this.compilerProps<string>(lang, toolBaseName + '.includeKey'),
                                options: splitArguments(this.compilerProps<string>(lang, toolBaseName + '.options')),
                                args: this.compilerProps<string>(lang, toolBaseName + '.args'),
                                languageId: this.compilerProps<string>(
                                    lang,
                                    toolBaseName + '.languageId',
                                ) as LanguageKey,
                                stdinHint: this.compilerProps<string>(lang, toolBaseName + '.stdinHint'),
                                monacoStdin: this.compilerProps<string>(lang, toolBaseName + '.monacoStdin'),
                                icon: this.compilerProps<string>(lang, toolBaseName + '.icon'),
                                darkIcon: this.compilerProps<string>(lang, toolBaseName + '.darkIcon'),
                                compilerLanguage: lang as LanguageKey,
                            },
                            {
                                ceProps: this.ceProps,
                                compilerProps: (propname: string) => this.compilerProps(lang, propname),
                            },
                        );
                    } else {
                        logger.warn(`Unable to stat ${toolBaseName} tool binary`);
                    }
                }
            }
        }
        return tools;
    }

    parseLibraries(baseLibs: Record<string, string>) {
        // Record language -> {Record lib name -> lib}
        const libraries: Record<string, Record<string, OptionsHandlerLibrary>> = {};
        for (const [lang, forLang] of Object.entries(baseLibs)) {
            if (lang && forLang) {
                libraries[lang] = {};
                for (const lib of forLang.split(':')) {
                    const libBaseName = `libs.${lib}`;
                    libraries[lang][lib] = {
                        name: this.compilerProps<string>(lang, libBaseName + '.name'),
                        url: this.compilerProps<string>(lang, libBaseName + '.url'),
                        description: this.compilerProps<string>(lang, libBaseName + '.description'),
                        staticliblink: splitIntoArray(this.compilerProps<string>(lang, libBaseName + '.staticliblink')),
                        liblink: splitIntoArray(this.compilerProps<string>(lang, libBaseName + '.liblink')),
                        dependencies: splitIntoArray(this.compilerProps<string>(lang, libBaseName + '.dependencies')),
                        versions: {},
                        examples: splitIntoArray(this.compilerProps<string>(lang, libBaseName + '.examples')),
                        options: splitArguments(this.compilerProps(lang, libBaseName + '.options', '')),
                        packagedheaders: this.compilerProps<boolean>(lang, libBaseName + '.packagedheaders', false),
                    };
                    const listedVersions = `${this.compilerProps(lang, libBaseName + '.versions')}`;
                    if (listedVersions) {
                        for (const version of listedVersions.split(':')) {
                            const libVersionName = libBaseName + `.versions.${version}`;
                            const versionObject: VersionInfo = {
                                version: this.compilerProps<string>(lang, libVersionName + '.version'),
                                staticliblink: splitIntoArray(
                                    this.compilerProps<string>(lang, libVersionName + '.staticliblink'),
                                    libraries[lang][lib].staticliblink,
                                ),
                                alias: splitIntoArray(this.compilerProps<string>(lang, libVersionName + '.alias')),
                                dependencies: splitIntoArray(
                                    this.compilerProps<string>(lang, libVersionName + '.dependencies'),
                                    libraries[lang][lib].dependencies,
                                ),
                                path: [],
                                libpath: [],
                                liblink: splitIntoArray(
                                    this.compilerProps<string>(lang, libVersionName + '.liblink'),
                                    libraries[lang][lib].liblink,
                                ),
                                // Library options might get overridden later
                                options: libraries[lang][lib].options,
                                hidden: this.compilerProps(lang, libVersionName + '.hidden', false),
                                packagedheaders: libraries[lang][lib].packagedheaders,
                            };

                            const lookupversion = this.compilerProps(lang, libVersionName + '.lookupversion');
                            if (lookupversion) {
                                versionObject.lookupversion = lookupversion;
                            }

                            const lookupname = this.compilerProps(lang, libVersionName + '.lookupname');
                            if (lookupname) {
                                versionObject.lookupname = lookupname;
                            }

                            const includes = this.compilerProps<string>(lang, libVersionName + '.path');
                            if (includes) {
                                versionObject.path = includes.split(path.delimiter);
                            } else if (version !== 'autodetect') {
                                logger.warn(`Library ${lib} ${version} (${lang}) has no include paths`);
                            }

                            const libpath = this.compilerProps<string>(lang, libVersionName + '.libpath');
                            if (libpath) {
                                versionObject.libpath = libpath.split(path.delimiter);
                            }

                            const options = this.compilerProps<string>(lang, libVersionName + '.options');
                            if (options !== undefined) {
                                versionObject.options = splitArguments(options);
                            }

                            versionObject.packagedheaders = this.compilerProps<boolean>(
                                lang,
                                libVersionName + '.packagedheaders',
                                libraries[lang][lib].packagedheaders,
                            );

                            libraries[lang][lib].versions[version] = versionObject;
                        }
                    } else {
                        logger.warn(`No versions found for ${lib} library`);
                    }
                }
            }
        }
        for (const langGroup of Object.values(libraries)) {
            for (const libGroup of Object.values(langGroup)) {
                const versions = Object.values(libGroup.versions);
                versions.sort((a, b) => semverParser.compare(asSafeVer(a.version), asSafeVer(b.version), true));
                let order = 0;
                // Set $order to index on array. As group is an array, iteration order is guaranteed.
                for (const lib of versions) {
                    lib['$order'] = order++;
                }
            }
        }
        return libraries;
    }

    libArrayToObject(libsArr: any[]) {
        const libs: Record<string, any> = {};
        for (const lib of libsArr) {
            libs[lib.id] = lib;

            const versions = lib.versions;
            lib.versions = {};

            for (const version of versions) {
                lib.versions[version.id] = version;
            }
        }
        return libs;
    }

    async getRemoteLibraries(language: LanguageKey, remoteUrl: string) {
        const remoteId = getRemoteId(remoteUrl, language);
        if (!this.remoteLibs[remoteId]) {
            return await new Promise(resolve => {
                const url = ClientOptionsHandler.getRemoteUrlForLibraries(remoteUrl, language);
                logger.info(`Fetching remote libraries from ${url}`);
                let fullData = '';
                https.get(url, res => {
                    res.on('data', data => {
                        fullData += data;
                    });
                    res.on('end', () => {
                        try {
                            const libsArr = JSON.parse(fullData);

                            this.remoteLibs[remoteId] = this.libArrayToObject(libsArr);
                        } catch (e) {
                            logger.error('Error while fetching remote libraries, but continuing.', e);
                            this.remoteLibs[remoteId] = {};
                        }

                        resolve(this.remoteLibs[remoteId]);
                    });
                });
            });
        }
        return this.remoteLibs[remoteId];
    }

    async fetchRemoteLibrariesIfNeeded(language: LanguageKey, target: string) {
        await this.getRemoteLibraries(language, target);
    }

    static getFullRemoteUrl(remote: Remote): string {
        return remote.target + remote.basePath;
    }

    static getRemoteUrlForLibraries(url: string, language: LanguageKey) {
        return urlJoin(url, '/api/libraries', language);
    }

    async setCompilers(compilers: CompilerInfo[]) {
        const forbiddenKeys = new Set([
            'exe',
            'versionFlag',
            'versionRe',
            'compilerType',
            'demangler',
            'objdumper',
            'postProcess',
            'demanglerType',
            'isSemVer',
        ]);
        const copiedCompilers = JSON.parse(JSON.stringify(compilers)) as CompilerInfo[];
        const semverGroups: Record<string, Partial<CompilerInfo>[]> = {};
        // Reset the supportsExecute flag in case critical compilers change

        for (const key of Object.keys(this.options.languages)) {
            this.options.languages[key].supportsExecute = false;
        }

        for (const [compilersKey, compiler] of copiedCompilers.entries()) {
            if (compiler.supportsExecute) {
                this.options.languages[compiler.lang].supportsExecute = true;
            }
            if (compiler.isSemVer) {
                if (!semverGroups[compiler.group]) semverGroups[compiler.group] = [];
                // Desired index which will keep the array in order
                semverGroups[compiler.group].push(compiler);
            }

            if (compiler.remote) {
                await this.fetchRemoteLibrariesIfNeeded(
                    compiler.lang,
                    ClientOptionsHandler.getFullRemoteUrl(compiler.remote),
                );
            }

            for (const propKey of Object.keys(compiler)) {
                if (forbiddenKeys.has(propKey)) {
                    delete copiedCompilers[compilersKey][propKey as keyof CompilerInfo];
                }
            }
        }

        for (const group of Object.values(semverGroups)) {
            group.sort((a, b) => semverParser.compare(asSafeVer(a.semver), asSafeVer(b.semver), true));
            let order = 0;
            // Set $order to -index on array. As group is an array, iteration order is guaranteed.
            for (const compiler of group) {
                compiler['$order'] = -order++;
            }
        }

        this.options.compilers = copiedCompilers;
        this.options.remoteLibs = this.remoteLibs;
        this._updateOptionsHash();
    }

    _updateOptionsHash() {
        this.optionsJSON = JSON.stringify(this.options);
        this.optionsHash = getHash(this.options, 'Options Hash V1');
        logger.info(`OPTIONS HASH: ${this.optionsHash}`);
    }

    get() {
        return this.options;
    }

    getJSON() {
        return this.optionsJSON;
    }

    getHash() {
        return this.optionsHash;
    }
}
