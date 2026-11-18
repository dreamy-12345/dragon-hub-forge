// Likes: one heart per person on any design, saved design or creation.
// Each person's likes are one record ({ name, liked: [targets] }) that only
// they write, so two people liking at once never overwrite each other.
// Targets: 'd:<designId>' for built-in designs, 'i:<ideaId>' for saved ones.
//
// Where they live: dreamDB on dream.sc (key likes/<person>), the local
// server's api/likes when run with server.mjs, or this browser (portable).

const ME_KEY = 'dragonhub-me'
const LOCAL_KEY = 'dragonhub-likes'

const slug = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

export function createLikes({ db, local }) {
  let me = null // { key, name }
  try { me = JSON.parse(localStorage.getItem(ME_KEY) || 'null') } catch {}
  let records = [] // [{ key, name, liked: [] }]
  const subs = []
  const emit = () => subs.forEach((f) => f())

  const store = db
    ? {
        all: async () => (await window.dreamDB.list('likes/')).map((r) => ({ key: r.key.slice(6), ...r.value })),
        put: (rec) => window.dreamDB.set('likes/' + rec.key, { name: rec.name, liked: rec.liked }),
      }
    : local
    ? {
        all: async () => { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') } catch { return [] } },
        put: async (rec) => {
          const all = await store.all()
          const i = all.findIndex((r) => r.key === rec.key)
          if (i < 0) all.push(rec); else all[i] = rec
          try { localStorage.setItem(LOCAL_KEY, JSON.stringify(all)) } catch {}
        },
      }
    : {
        all: async () => { const r = await fetch('api/likes'); return r.ok ? r.json() : [] },
        put: async (rec) => {
          const r = await fetch('api/likes/' + encodeURIComponent(rec.key), { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: rec.name, liked: rec.liked }) })
          if (!r.ok) throw new Error('could not save the like')
        },
      }

  // on dream.sc the signed-in account names you; elsewhere you type a name once
  const ready = (async () => {
    if (db && !me) {
      try {
        const who = await window.dreamDB.me()
        if (who?.signedIn && who.name) me = { key: slug(who.name), name: who.name, account: true }
      } catch {}
    }
  })()

  let sig = ''
  async function refresh() {
    try { records = (await store.all()).filter((r) => r && r.key && Array.isArray(r.liked)) } catch {}
    const now = JSON.stringify(records)
    if (now !== sig) { sig = now; emit() } // polled: redraw only on a change
  }

  const whoLiked = (t) => records.filter((r) => r.liked.includes(t)).map((r) => r.name || r.key)
  const mine = () => records.find((r) => me && r.key === me.key)

  return {
    ready,
    refresh,
    onChange: (f) => subs.push(f),
    me: () => me,
    setName(name) {
      name = String(name || '').trim().slice(0, 40)
      if (!slug(name)) return false
      me = { key: slug(name), name }
      try { localStorage.setItem(ME_KEY, JSON.stringify(me)) } catch {}
      emit()
      return true
    },
    count: (t) => whoLiked(t).length,
    names: whoLiked,
    likedByMe: (t) => !!mine()?.liked.includes(t),
    myLikes: () => new Set(mine()?.liked || []),
    async toggle(t) {
      if (!me) return false
      let rec = mine()
      if (!rec) { rec = { key: me.key, name: me.name, liked: [] }; records.push(rec) }
      rec.name = me.name
      rec.liked = rec.liked.includes(t) ? rec.liked.filter((x) => x !== t) : [...rec.liked, t]
      emit() // show it at once; the save follows
      try { await store.put(rec) } catch { await refresh() }
      return true
    },
  }
}
