#!/usr/bin/env node
import { runJsonCli } from '../shared/json-cli.mjs';
import { submit, reviewRoutine } from './core/plan.js';

const review = process.argv[2] === '--review';
if (review) process.argv.splice(2, 1);
await runJsonCli(review ? reviewRoutine : submit);
