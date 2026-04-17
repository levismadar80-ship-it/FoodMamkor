const { execSync } = require('child_process')

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf8' }).trim() }
  catch (e) { return '' }
}

const branch = run('git branch --show-current')
run('git fetch --prune origin 2>&1')
const drift = run('git log --oneline origin/staging..origin/main')
const claudeBranches = run("git branch -r | grep 'claude/'")
const warnings = []

if (drift) warnings.push(`⚠️ staging drifted from main:\n${drift}`)
if (claudeBranches) warnings.push(`🚨 STOP — claude/* branch detected:\n${claudeBranches}`)
if (branch === 'main' || branch === 'staging') {
  warnings.push(`🚨 STOP — on protected branch: ${branch}. Switch to feature/* first.`)
}
if (warnings.length > 0) {
  console.log('\n=== PRE-TASK CHECK ===')
  warnings.forEach(w => console.log(w))
  console.log('Report to user before proceeding.\n')
}
