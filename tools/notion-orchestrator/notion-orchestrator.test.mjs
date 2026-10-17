// Unit tests for the pure helpers in orchestrator.mjs.
//   node --test tools/notion-orchestrator/notion-orchestrator.test.mjs

// 在 notion-orchestrator.mjs 顶部加入以下代理注入配置
const CLASH_PORT = process.env.CLASH_PORT || '7897'; // Clash Verge 用户注意核对是否为 7897
const PROXY_URL = `http://127.0.0.1:${CLASH_PORT}`;

// 注入到当前进程环境，spawnSync 拉起的 ntn 和 claude 会自动继承
Object.assign(process.env, {
  HTTP_PROXY: PROXY_URL,
  HTTPS_PROXY: PROXY_URL,
  ALL_PROXY: PROXY_URL,
  NO_PROXY: 'localhost,127.0.0.1,::1',
  // Node.js 22+ 原生 fetch 代理支持
  NODE_USE_ENV_PROXY: '1'
});


import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  buildReadyFilter,
  chooseBranchName,
  chunkText,
  decideOutcome,
  extractResolvedIds,
  extractSessionUrl,
  markdownFence,
  normalizeNotionId,
  parseClaudeOutput,
  parseStatusLine,
  parseTargetFiles,
  prepareWorktree,
  priorityRank,
  redactSecrets,
  runSelfTest,
  sanitizeBranchName,
  stripFrontmatter,
  validateSchema,
  valueForProperty,
} from './orchestrator.mjs';

const cfg = {
  props: {
    title: 'Name',
    status: 'Status',
    assignedAgent: 'Assigned Agent',
    priority: 'Priority',
    blockedBy: 'Blocked By',
    targetFiles: 'Target Files',
    gitBranch: 'Git Branch',
  },
  statuses: {
    backlog: 'Backlog',
    ready: 'Ready',
    inProgress: 'In Progress',
    blocked: 'Blocked',
    review: 'Review',
    done: 'Done',
  },
  targetAgent: 'Claude Code',
};

const schema = {
  properties: {
    Name: { type: 'title', title: {} },
    Status: {
      type: 'status',
      status: {
        options: [
          { name: 'Backlog' },
          { name: 'Ready' },
          { name: 'In Progress' },
          { name: 'Blocked' },
          { name: 'Review' },
          { name: 'Done' },
        ],
      },
    },
    'Assigned Agent': {
      type: 'select',
      select: { options: [{ name: 'Claude Code' }, { name: 'Codex' }] },
    },
  },
};

test('self-test suite passes', () => {
  assert.ok(runSelfTest() >= 30);
});

test('stripFrontmatter removes only a leading YAML block', () => {
  assert.equal(stripFrontmatter('---\ntitle: X\nStatus: Ready\n---\n# Body\n'), '# Body\n');
  assert.equal(stripFrontmatter('# No frontmatter'), '# No frontmatter');
});

test('buildReadyFilter uses status and select filter shapes', () => {
  assert.deepEqual(buildReadyFilter(schema, cfg), {
    and: [
      { property: 'Status', status: { equals: 'Ready' } },
      { property: 'Assigned Agent', select: { equals: 'Claude Code' } },
    ],
  });
});

test('validateSchema accepts the documented schema', () => {
  assert.deepEqual(validateSchema(schema, cfg), []);
});

test('validateSchema reports missing status options', () => {
  const broken = { properties: { ...schema.properties, Status: { type: 'status', status: { options: [{ name: 'Ready' }] } } } };
  const problems = validateSchema(broken, cfg);
  assert.ok(problems.some((p) => p.includes('In Progress')));
});

test('sanitizeBranchName keeps git-safe names', () => {
  assert.equal(sanitizeBranchName('Task A/B!!'), 'task-a/b');
  assert.equal(sanitizeBranchName('Hello World'), 'task-hello-world');
  assert.equal(sanitizeBranchName('feature/foo'), 'feature/foo');
});

test('priorityRank handles P0/P1/P2 and words', () => {
  assert.equal(priorityRank({ priority: 'P0 - Critical' }), 0);
  assert.equal(priorityRank({ priority: 'P2 - Normal' }), 2);
  assert.equal(priorityRank({ priority: 'High' }), 1);
  assert.equal(priorityRank({ priority: '' }), 99);
});

test('parseStatusLine finds the contract line', () => {
  assert.equal(parseStatusLine('SUMMARY: x\nSTATUS: DONE\nCOMMIT: abc'), 'DONE');
  assert.equal(parseStatusLine('STATUS: BLOCKED'), 'BLOCKED');
  assert.equal(parseStatusLine('no status'), 'UNKNOWN');
  assert.equal(
    parseStatusLine('Contract:\n```\nSTATUS: DONE\n```\nSTATUS: BLOCKED'),
    'BLOCKED',
    'a quoted contract inside a fence must not override the real final status',
  );
});

test('chunkText is lossless and respects the limit', () => {
  const text = 'a'.repeat(4001);
  const chunks = chunkText(text, 1900);
  assert.ok(chunks.every((chunk) => chunk.length <= 1900));
  assert.equal(chunks.join(''), text);

  const multiline = 'line one\n'.repeat(400);
  const lines = chunkText(multiline, 100);
  assert.ok(lines.every((chunk) => chunk.length <= 100));
  assert.equal(lines.join(''), multiline, 'newlines at split boundaries must be preserved');
});

test('normalizeNotionId handles URLs and UUIDs', () => {
  assert.equal(
    normalizeNotionId('https://www.notion.so/foo/0123456789abcdef0123456789abcdef?v=1'),
    '01234567-89ab-cdef-0123-456789abcdef',
  );
  assert.equal(
    normalizeNotionId('01234567-89ab-cdef-0123-456789abcdef'),
    '01234567-89ab-cdef-0123-456789abcdef',
  );
});

test('extractResolvedIds handles common resolve shapes', () => {
  assert.deepEqual(
    extractResolvedIds({ data_sources: [{ id: '0123456789abcdef0123456789abcdef' }] }),
    ['01234567-89ab-cdef-0123-456789abcdef'],
  );
});

test('parseClaudeOutput reads the JSON result', () => {
  const parsed = parseClaudeOutput('{"result":"STATUS: DONE","session_id":"s1","total_cost_usd":0.01}');
  assert.equal(parsed.result, 'STATUS: DONE');
  assert.equal(parsed.meta.session_id, 's1');
});

test('redactSecrets hides common credentials', () => {
  const out = redactSecrets('NOTION_API_TOKEN=ntn_abcdefghijklmnop\nAuthorization: Bearer abcdefghijklmnop');
  assert.ok(!out.includes('ntn_abcdefghijklmnop'));
  assert.ok(out.includes('Bearer ***'));
});

test('valueForProperty encodes numbers, text and invalid URLs', () => {
  assert.deepEqual(valueForProperty({ type: 'number' }, '3'), { number: 3 });
  assert.deepEqual(valueForProperty({ type: 'rich_text' }, 'hi'), {
    rich_text: [{ type: 'text', text: { content: 'hi' } }],
  });
  assert.equal(valueForProperty({ type: 'url' }, 'session://abc'), undefined);
});

test('parseTargetFiles splits and normalizes common separators', () => {
  assert.deepEqual(parseTargetFiles('src/a.js, test/a.test.js\nsrc/b.js'), [
    'src/a.js',
    'test/a.test.js',
    'src/b.js',
  ]);
  assert.deepEqual(parseTargetFiles('src\\a.js, src/./b.js, ../outside.js'), [
    'src/a.js',
    'src/b.js',
  ]);
});

test('extractSessionUrl finds session and thread URLs', () => {
  assert.equal(extractSessionUrl('see session://space/abc for details'), 'session://space/abc');
  assert.equal(extractSessionUrl('thread://abc'), 'thread://abc');
});

test('markdownFence grows when the body contains fences', () => {
  const fenced = markdownFence('```js\nconsole.log(1)\n```');
  assert.ok(fenced.startsWith('````text'));
});

test('decideOutcome covers the run state machine', () => {
  const base = {
    statuses: cfg.statuses,
    taskTimeoutMs: 7_200_000,
    noWorktree: false,
    gitAvailable: true,
  };

  assert.equal(decideOutcome(base, { timedOut: true }).nextStatus, 'Blocked');
  assert.match(decideOutcome(base, { timedOut: true }).errorText, /TIMEOUT/);

  assert.equal(decideOutcome(base, { spawnError: new Error('boom') }).nextStatus, 'Blocked');
  assert.equal(decideOutcome(base, { exitStatus: 1 }).nextStatus, 'Blocked');
  assert.equal(decideOutcome(base, { isError: true, errorResult: 'bad' }).nextStatus, 'Blocked');

  assert.equal(decideOutcome(base, {
    statusLine: 'DONE', commit: 'new', baseCommit: 'old', gitStatus: '',
  }).nextStatus, 'Review');

  assert.equal(decideOutcome(base, {
    statusLine: 'DONE', commit: 'old', baseCommit: 'old', gitStatus: '',
  }).nextStatus, 'Blocked');

  assert.equal(decideOutcome({ ...base, noWorktree: true, gitAvailable: false }, {
    statusLine: 'DONE', commit: '', baseCommit: '', gitStatus: '',
  }).nextStatus, 'Review');

  assert.equal(decideOutcome(base, {
    statusLine: 'DONE', commit: 'new', baseCommit: 'old', gitStatus: '?? scratch.txt',
  }).nextStatus, 'Blocked');

  assert.equal(decideOutcome(base, { statusLine: 'NO_CHANGES', gitStatus: '' }).nextStatus, 'Review');
  assert.equal(decideOutcome(base, { statusLine: 'NO_CHANGES', gitStatus: ' M file' }).nextStatus, 'Blocked');
  assert.equal(decideOutcome(base, { statusLine: 'BLOCKED' }).nextStatus, 'Blocked');
  assert.equal(decideOutcome(base, { statusLine: 'FAILED' }).nextStatus, 'Blocked');
  assert.equal(decideOutcome(base, { statusLine: 'UNKNOWN' }).nextStatus, 'Blocked');
  assert.match(decideOutcome(base, { branchMismatch: 'wrong branch' }).errorText, /wrong branch/);
  assert.match(decideOutcome(base, { gitStateError: 'git status failed' }).errorText, /git status failed/);
  assert.equal(decideOutcome(base, {
    statusLine: 'DONE',
    commit: 'new',
    baseCommit: 'old',
    permissionDenials: [{ tool: 'Bash' }],
  }).nextStatus, 'Blocked', 'permission denials must not produce a Review');
});

test('prepareWorktree creates and reuses an isolated branch', (t) => {
  const gitVersion = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (gitVersion.status !== 0) {
    t.skip('git is not available');
    return;
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'notion-orch-'));
  const repo = path.join(root, 'repo');
  const worktrees = path.join(root, 'worktrees');
  let firstPath = '';
  fs.mkdirSync(repo, { recursive: true });

  const run = (args, cwd = repo) => {
    const res = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr || res.stdout}`);
    return res;
  };

  try {
    run(['init']);
    run(['config', 'user.name', 'Orchestrator Test']);
    run(['config', 'user.email', 'orchestrator@example.invalid']);
    fs.writeFileSync(path.join(repo, 'README.md'), '# test\n', 'utf8');
    run(['add', 'README.md']);
    run(['commit', '-m', 'initial']);

    const cfg = {
      repoRoot: repo,
      worktreeBase: worktrees,
      baseRef: 'HEAD',
      branchPrefix: 'task',
      noWorktree: false,
      fetchFirst: false,
      verbose: false,
      childEnv: process.env,
    };

    const first = prepareWorktree(cfg, 'task-test-one');
    firstPath = first;
    assert.ok(fs.existsSync(path.join(first, 'README.md')));
    assert.equal(run(['rev-parse', '--abbrev-ref', 'HEAD'], first).stdout.trim(), 'task-test-one');

    const again = prepareWorktree(cfg, 'task-test-one');
    assert.equal(again, first);

    const task = { id: '01234567-89ab-cdef-0123-456789abcdef', title: 'Add safe math helpers', gitBranch: '' };
    const branch = chooseBranchName(cfg, task);
    assert.ok(branch.startsWith('task-01234567'));
    assert.ok(branch.includes('add-safe-math-helpers'));

    assert.equal(
      chooseBranchName(cfg, { id: 'x', title: 'y', gitBranch: 'Feature/ABC' }),
      'Feature/ABC',
      'explicit branch names keep their case',
    );
    assert.ok(
      chooseBranchName(cfg, { id: 'x', title: 'y', gitBranch: 'main' }).startsWith('task-'),
      'protected branch names are rejected',
    );
  } finally {
    if (firstPath) {
      try { spawnSync('git', ['worktree', 'remove', '--force', firstPath], { cwd: repo, windowsHide: true }); } catch {}
    }
    try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
  }
});
