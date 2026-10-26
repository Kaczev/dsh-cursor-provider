import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8');
const used = [...new Set([...source.matchAll(/\b(?:t|copy)\('([a-zA-Z]+)'/g)].map(match => match[1]))];
const zh = source.slice(source.indexOf('zh: {'), source.indexOf('en: {'));
const en = source.slice(source.indexOf('en: {'));
const has = (block, key) => new RegExp(`(^|\\s)${key}:`).test(block);
const missingZh = used.filter(key => !has(zh, key));
const missingEn = used.filter(key => !has(en, key));
console.log(JSON.stringify({keys: used.length, missingZh, missingEn}));
