// Lightweight BM25 search engine over PROUT_CHUNKS (no external deps, runs fully offline)

const STOPWORDS = new Set("a an the of to in and is are was were be been being this that these those it its as for on with by from at or not but if then than so such can could will would should may might must shall do does did have has had i you he she we they them his her our your their what which who whom when where why how all each every both few more most other some no nor only own same too very s t just".split(' '));

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter(w => w.length > 1 && !STOPWORDS.has(w));
}

class BM25Index {
  constructor(chunks) {
    this.chunks = chunks;
    this.k1 = 1.5;
    this.b = 0.75;
    this.docTokens = [];
    this.df = new Map(); // term -> doc freq
    this.docLen = [];
    let totalLen = 0;

    for (const chunk of chunks) {
      const toks = tokenize(chunk.text + ' ' + chunk.chapter_title);
      this.docTokens.push(toks);
      this.docLen.push(toks.length);
      totalLen += toks.length;
      const seen = new Set();
      for (const t of toks) {
        if (!seen.has(t)) {
          seen.add(t);
          this.df.set(t, (this.df.get(t) || 0) + 1);
        }
      }
    }
    this.avgDocLen = totalLen / chunks.length;
    this.N = chunks.length;

    // term frequencies per doc
    this.tf = this.docTokens.map(toks => {
      const m = new Map();
      for (const t of toks) m.set(t, (m.get(t) || 0) + 1);
      return m;
    });

    // idf cache
    this.idf = new Map();
    for (const [term, df] of this.df.entries()) {
      this.idf.set(term, Math.log(1 + (this.N - df + 0.5) / (df + 0.5)));
    }
  }

  score(queryTerms, docIdx) {
    let s = 0;
    const tfMap = this.tf[docIdx];
    const dl = this.docLen[docIdx];
    for (const term of queryTerms) {
      const f = tfMap.get(term);
      if (!f) continue;
      const idf = this.idf.get(term) || 0;
      const num = f * (this.k1 + 1);
      const denom = f + this.k1 * (1 - this.b + this.b * dl / this.avgDocLen);
      s += idf * (num / denom);
    }
    return s;
  }

  search(query, topK = 6) {
    const qTerms = [...new Set(tokenize(query))];
    if (qTerms.length === 0) return [];
    const scores = [];
    for (let i = 0; i < this.N; i++) {
      const s = this.score(qTerms, i);
      if (s > 0) scores.push([i, s]);
    }
    scores.sort((a, b) => b[1] - a[1]);
    return scores.slice(0, topK).map(([idx, s]) => ({ ...this.chunks[idx], score: s }));
  }
}

let PROUT_INDEX = null;
function getProutIndex() {
  if (!PROUT_INDEX) PROUT_INDEX = new BM25Index(PROUT_CHUNKS);
  return PROUT_INDEX;
}
