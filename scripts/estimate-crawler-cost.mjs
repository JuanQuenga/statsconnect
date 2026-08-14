#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultConfigPath = path.join(scriptDirectory, "crawler-cost.config.json");

export function estimateJob(job, daysPerMonth) {
  const intervalMinutes = positiveNumber(job.intervalMinutes, `${job.id}.intervalMinutes`);
  const batchSize = positiveNumber(job.batchSize ?? 1, `${job.id}.batchSize`);
  const runs = (daysPerMonth * 24 * 60) / intervalMinutes;
  const upstreamRequestsPerRun =
    nonNegativeNumber(job.fixedUpstreamRequestsPerRun ?? 0, `${job.id}.fixedUpstreamRequestsPerRun`) +
    batchSize * nonNegativeNumber(job.upstreamRequestsPerItem ?? 0, `${job.id}.upstreamRequestsPerItem`);
  const childCallsPerRun =
    nonNegativeNumber(job.fixedChildCallsPerRun ?? 0, `${job.id}.fixedChildCallsPerRun`) +
    batchSize * nonNegativeNumber(job.childCallsPerItem ?? 0, `${job.id}.childCallsPerItem`);
  const actionCallsPerRun = nonNegativeNumber(job.actionCallsPerRun ?? 1, `${job.id}.actionCallsPerRun`);
  const roughDbReadsPerRun =
    nonNegativeNumber(job.roughDbReadsPerRun ?? 0, `${job.id}.roughDbReadsPerRun`) +
    batchSize * nonNegativeNumber(job.roughDbReadsPerItem ?? 0, `${job.id}.roughDbReadsPerItem`);
  const roughDbWritesPerRun =
    nonNegativeNumber(job.roughDbWritesPerRun ?? 0, `${job.id}.roughDbWritesPerRun`) +
    batchSize * nonNegativeNumber(job.roughDbWritesPerItem ?? 0, `${job.id}.roughDbWritesPerItem`);

  return {
    ...job,
    intervalMinutes,
    batchSize,
    runs,
    upstreamRequestsPerRun,
    upstreamRequests: runs * upstreamRequestsPerRun,
    childCallsPerRun,
    childCalls: runs * childCallsPerRun,
    actionCalls: runs * actionCallsPerRun,
    functionCalls: runs * (actionCallsPerRun + childCallsPerRun),
    roughDbReads: runs * roughDbReadsPerRun,
    roughDbWrites: runs * roughDbWritesPerRun
  };
}

export function estimateConfig(config, filters = {}) {
  const daysPerMonth = positiveNumber(config.daysPerMonth ?? 30, "daysPerMonth");
  const jobs = config.jobs.filter((job) => {
    if (job.enabled === false) return false;
    if (filters.game && job.game.toLowerCase() !== filters.game.toLowerCase()) return false;
    if (filters.job && job.id !== filters.job && job.name !== filters.job) return false;
    return true;
  });
  if (!jobs.length) throw new Error("No enabled jobs matched the requested filters.");

  const estimates = jobs.map((job) => estimateJob(job, daysPerMonth));
  const totals = estimates.reduce(
    (total, job) => {
      total.runs += job.runs;
      total.upstreamRequests += job.upstreamRequests;
      total.childCalls += job.childCalls;
      total.actionCalls += job.actionCalls;
      total.functionCalls += job.functionCalls;
      total.roughDbReads += job.roughDbReads;
      total.roughDbWrites += job.roughDbWrites;
      return total;
    },
    { runs: 0, upstreamRequests: 0, childCalls: 0, actionCalls: 0, functionCalls: 0, roughDbReads: 0, roughDbWrites: 0 }
  );

  return { daysPerMonth, assumptions: config.assumptions ?? [], jobs: estimates, totals };
}

function positiveNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label} must be a positive number.`);
  return number;
}

function nonNegativeNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${label} must be zero or greater.`);
  return number;
}

function loadConfig(configPath) {
  return JSON.parse(fs.readFileSync(configPath, "utf8"));
}

function setConfigValue(config, expression) {
  const separator = expression.indexOf("=");
  if (separator < 1) throw new Error(`Invalid --set value: ${expression}. Use path=value.`);
  const keyPath = expression.slice(0, separator).split(".");
  const rawValue = expression.slice(separator + 1);
  const value = rawValue === "true" ? true : rawValue === "false" ? false : Number.isNaN(Number(rawValue)) ? rawValue : Number(rawValue);
  let target = config;
  for (const key of keyPath.slice(0, -1)) {
    if (target[key] === undefined) target[key] = {};
    target = target[key];
  }
  target[keyPath.at(-1)] = value;
}

function parseArgs(argv) {
  const options = { configPath: defaultConfigPath, filters: {}, sets: [], json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--config") options.configPath = path.resolve(argv[++index]);
    else if (argument === "--days") options.days = positiveNumber(argv[++index], "--days");
    else if (argument === "--game") options.filters.game = argv[++index];
    else if (argument === "--job") options.filters.job = argv[++index];
    else if (argument === "--set") options.sets.push(argv[++index]);
    else if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function formatInterval(minutes) {
  if (minutes % (24 * 60) === 0) return `${minutes / (24 * 60)}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function printReport(report, configPath) {
  console.log(`Crawler cost estimate (${report.daysPerMonth}-day month)`);
  console.log(`Config: ${configPath}`);
  console.log("");
  console.log("Job                                      Interval  Batch  Runs/mo  Upstream/mo  Child calls/mo  Function calls/mo  Rough reads/mo  Rough writes/mo");
  for (const job of report.jobs) {
    const label = `${job.game} ${job.name}`.slice(0, 40).padEnd(40);
    console.log(
      `${label} ${formatInterval(job.intervalMinutes).padStart(8)} ${formatNumber(job.batchSize).padStart(6)} ${formatNumber(job.runs).padStart(8)} ${formatNumber(job.upstreamRequests).padStart(12)} ${formatNumber(job.childCalls).padStart(16)} ${formatNumber(job.functionCalls).padStart(18)} ${formatNumber(job.roughDbReads).padStart(15)} ${formatNumber(job.roughDbWrites).padStart(16)}`
    );
  }
  console.log("");
  console.log(`Totals: ${formatNumber(report.totals.upstreamRequests)} upstream requests; ${formatNumber(report.totals.functionCalls)} Convex function calls (${formatNumber(report.totals.actionCalls)} cron action invocations + ${formatNumber(report.totals.childCalls)} child calls).`);
  console.log(`Rough database proxy: ${formatNumber(report.totals.roughDbReads)} reads and ${formatNumber(report.totals.roughDbWrites)} writes. These are not billing facts.`);
  console.log("");
  console.log("Assumptions:");
  for (const assumption of report.assumptions) console.log(`- ${assumption}`);
  for (const job of report.jobs.filter((entry) => entry.notes)) console.log(`- ${job.id}: ${job.notes}`);
}

function printHelp() {
  console.log(`Usage: pnpm estimate:crawler-cost [options]

Options:
  --config <path>       Read a JSON cost configuration (default: scripts/crawler-cost.config.json)
  --days <number>       Override the configured month length
  --game <Brawl|Clash>  Limit the report to one game
  --job <id-or-name>    Limit the report to one job
  --set <path=value>    Override config, e.g. --set jobs.0.batchSize=1
  --json                Emit machine-readable JSON
  --help                Show this help`);
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  const config = loadConfig(options.configPath);
  if (options.days !== undefined) config.daysPerMonth = options.days;
  for (const expression of options.sets) setConfigValue(config, expression);
  const report = estimateConfig(config, options.filters);
  if (options.json) console.log(JSON.stringify({ configPath: options.configPath, ...report }, null, 2));
  else printReport(report, options.configPath);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
