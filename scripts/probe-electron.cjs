// Electron 런타임 프로브: 실제로 뜨는 Electron/Node/Chrome 버전과 node:sqlite + FTS5 가용성을 확인한다.
// 사용: npx electron scripts/probe-electron.cjs
const { app } = require('electron')

function probe() {
  const result = {
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    nodeSqlite: 'unknown',
    fts5: 'unknown'
  }

  let sqlite
  try {
    sqlite = require('node:sqlite')
    result.nodeSqlite = `ok (DatabaseSync: ${typeof sqlite.DatabaseSync})`
  } catch (error) {
    result.nodeSqlite = `fail: ${error.message}`
    return result
  }

  try {
    const db = new sqlite.DatabaseSync(':memory:')
    db.exec('create virtual table t using fts5(x)')
    db.prepare('insert into t(x) values (?)').run('hello fts5 world')
    const rows = db.prepare("select x from t where t match 'fts5'").all()
    result.fts5 = rows.length > 0 ? `ok (rows=${rows.length}, first=${rows[0].x})` : 'fail: 0 rows'
    db.close()
  } catch (error) {
    result.fts5 = `fail: ${error.message}`
  }

  return result
}

app.whenReady().then(() => {
  const result = probe()
  // stdout 이 파이프일 때 출력이 잘리지 않도록 flush 콜백에서 종료한다.
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`, () => {
    app.quit()
  })
})
