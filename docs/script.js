const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const bumpType = commits => {
  if (commits.some(c => c.type === 'break')) return 'major'
  if (commits.some(c => c.type === 'feat')) return 'minor'
  return 'patch'
}

const applyBump = ([major, minor, patch], kind) => {
  if (kind === 'major') return [major + 1, 0, 0]
  if (kind === 'minor') return [major, minor + 1, 0]
  return [major, minor, patch + 1]
}

const releases = [
  {
    commits: [
      { type: 'feat', scope: 'auth', subject: 'add passkey support' },
      { type: 'fix', scope: 'editor', subject: 'preserve cursor on undo' },
      { type: 'feat', scope: 'api', subject: 'expose webhook events' }
    ]
  },
  {
    commits: [
      { type: 'fix', scope: 'ui', subject: 'crash on long filenames' },
      { type: 'fix', scope: 'api', subject: 'retry on 503' }
    ]
  },
  {
    commits: [
      { type: 'break', scope: 'sdk', subject: 'drop node 18 support' },
      { type: 'feat', scope: 'cli', subject: 'new diff renderer' },
      { type: 'fix', scope: 'search', subject: 'escape regex chars' }
    ]
  },
  {
    commits: [
      { type: 'feat', scope: 'billing', subject: 'usage-based invoices' },
      { type: 'feat', scope: 'settings', subject: 'per-repo templates' }
    ]
  }
]

const typeLabel = { feat: 'feat', fix: 'fix', break: 'feat!' }

const tickerList = document.querySelector('[data-ticker]')
const bucketFeat = document.querySelector('[data-bucket="feat"]')
const bucketFix = document.querySelector('[data-bucket="fix"]')
const bucketBreak = document.querySelector('[data-bucket="break"]')
const updated = document.querySelector('[data-updated]')
const flipEls = Array.from(document.querySelectorAll('[data-flip]'))

const bucketFor = type => (type === 'feat' ? bucketFeat : type === 'fix' ? bucketFix : bucketBreak)

let version = [2, 3, 0]

const renderFlipper = () => {
  flipEls.forEach((el, i) => {
    const card = el.querySelector('.flip-card')
    card.textContent = String(version[i])
  })
}

const flipTo = next => {
  version = next
  if (reduceMotion) {
    renderFlipper()
    return Promise.resolve()
  }
  return new Promise(resolve => {
    flipEls.forEach((el, i) => {
      const card = el.querySelector('.flip-card')
      if (card.textContent === String(next[i])) return
      el.classList.add('is-flipping')
      setTimeout(() => {
        card.textContent = String(next[i])
        el.classList.remove('is-flipping')
        el.classList.add('is-flipping-in')
        setTimeout(() => el.classList.remove('is-flipping-in'), 280)
      }, 240)
    })
    setTimeout(resolve, 520)
  })
}

const addTickerItem = commit => {
  const li = document.createElement('li')
  li.className = 'ticker-item'
  li.dataset.type = commit.type
  li.innerHTML = `
    <span class="ticker-type">${typeLabel[commit.type]}</span>
    <span class="ticker-subject"><span class="ticker-scope">${commit.scope}:</span> ${commit.subject}</span>
  `
  tickerList.appendChild(li)
  while (tickerList.children.length > 3) {
    const first = tickerList.firstElementChild
    first.classList.add('is-leaving')
    setTimeout(() => first.remove(), 240)
  }
  return li
}

const addToBucket = commit => {
  const bucket = bucketFor(commit.type)
  const li = document.createElement('li')
  li.textContent = `${commit.scope}: ${commit.subject}`
  bucket.appendChild(li)
}

const clearBuckets = () => {
  ;[bucketFeat, bucketFix, bucketBreak].forEach(b => (b.innerHTML = ''))
}

const wait = ms => new Promise(resolve => setTimeout(resolve, reduceMotion ? Math.min(ms, 200) : ms))

const bumpUpdated = () => {
  let seconds = 0
  if (updated) {
    updated.textContent = 'updated just now'
    setInterval(() => {
      seconds += 1
      if (seconds < 60) updated.textContent = `updated ${seconds}s ago`
      else updated.textContent = `updated ${Math.floor(seconds / 60)}m ago`
    }, 1000)
  }
}

const cycle = async () => {
  const startVersion = [...version]
  let idx = 0
  while (true) {
    const release = releases[idx % releases.length]
    for (const commit of release.commits) {
      addTickerItem(commit)
      await wait(800)
      addToBucket(commit)
      await wait(700)
    }
    await wait(800)
    const next = applyBump(version, bumpType(release.commits))
    await flipTo(next)
    await wait(reduceMotion ? 400 : 3600)
    clearBuckets()
    Array.from(tickerList.children).forEach(el => {
      el.classList.add('is-leaving')
      setTimeout(() => el.remove(), 240)
    })
    await wait(500)
    idx += 1
    if (idx % releases.length === 0) {
      await flipTo([...startVersion])
      await wait(1200)
    }
  }
}

const setupCopy = () => {
  const btn = document.querySelector('[data-copy]')
  const yaml = document.getElementById('yaml')
  const label = document.querySelector('[data-copy-label]')
  if (!btn || !yaml || !label) return
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(yaml.textContent.trim())
      btn.classList.add('is-copied')
      label.textContent = 'Copied'
      setTimeout(() => {
        btn.classList.remove('is-copied')
        label.textContent = 'Copy'
      }, 1800)
    } catch {
      label.textContent = 'Select + copy'
    }
  })
}

renderFlipper()
bumpUpdated()
setupCopy()

if (!reduceMotion) {
  cycle()
} else {
  const snapshot = releases[0].commits
  snapshot.forEach(c => {
    addTickerItem(c)
    addToBucket(c)
  })
  flipTo(applyBump(version, bumpType(snapshot)))
}
