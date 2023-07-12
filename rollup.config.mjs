/* eslint-disable import/no-extraneous-dependencies */
import typescript from 'rollup-plugin-typescript2'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import json from '@rollup/plugin-json'
import cleaner from 'rollup-plugin-cleaner'
import * as fs from 'fs'


const input = 'src/server.ts'
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
const banner = `/**
 * @module ${pkg.name}
 * @version ${pkg.version}
 * @file ${pkg.description}
 * @copyright Privacy and Scaling Explorations 2023
 * @license ${pkg.license}
 * @see [Github]{@link ${pkg.homepage}}
*/`


const typescriptPlugin = typescript({
  tsconfig: 'tsconfig.json',
  useTsconfigDeclarationDir: true,
})

const nodePlugins = [
  typescriptPlugin,
  // `browser: false` is required for `fs` and other Node.js core modules to be resolved correctly
  nodeResolve({ browser: false }),
  // To accept commonjs modules and convert them to ES module, since rollup only bundle ES modules by default
  commonjs(),
  // Parse JSON files and make them ES modules. Required when bundling circomlib
  json(),
]


export default [
  // Node.js build
  {
    input,
    output: { file: pkg.main, format: 'cjs', banner },
    external: Object.keys(pkg.dependencies),
    plugins: [
      cleaner({
        targets: [
          './dist/',
        ],
      }),
      ...nodePlugins,
    ],
  }
]