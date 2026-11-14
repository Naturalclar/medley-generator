import {defineConfig,devices} from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({...base, testMatch:'scores.spec.ts', projects:[{name:'webkit-ipad',use:{...devices['iPad Pro 11'],browserName:'webkit'}}]});
