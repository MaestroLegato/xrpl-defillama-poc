# TVL tracking on XRPL with only on-chain calls

This repo is a proof of concept for platforms like DeFiLlama to fetch XRPL TVL without relying on a third-party indexing API.

## Different versions of a script

The repository contains 2 versions of the script. They are mostly identical and are here just for easier understanding what's going on.

1. `index.js` - the main "production" script that is going to be plugged into DeFiLlama adapter. Mostle the same as `index_verbose` but with removed debugging addons and comments.
2. `index_verbose.js` - the Proof-of-Concept script that gets TVL and prints it in the terminal, also has additional stuff like: JSDoc typings, basic test for verifying calculation logic, performance measurements. Run with `npm run start:verbose`.

## Error handling

The errors that might be thrown in this script are caught in the top-most caller. This is because there is not much point in handling individual hiccups in the middle of execution, if something went wrong - it is better to retry the whole process.

It is, of course, possible to attach retry logic to individual requests, but that complicates code quite a bit. Given that errors are not that common (at least in my testing) it is easier to re-run the whole thing if that happens.

## Performance

Rought estimates on the performance of this script. Ran with dedicated rippled node (expect public to be much slower due to throttling).

### Remote rippled node

**Discovery phase:**  
Duration - ~20 minutes  
Memory Usage (in MB):

```
Low { rss: 47.25, heapTotal: 10.84, heapUsed: 7.81, external: 0.64 }
High { rss: 129.31, heapTotal: 30.59, heapUsed: 22.97, external: 1.98 }
```

**Getting pool reserves:**  
Duration - 23 seconds  
Memory Usage (in MB):

```
Low { rss: 47.25, heapTotal: 10.84, heapUsed: 7.81, external: 0.64 }
High { rss: 175.39, heapTotal: 79.34, heapUsed: 47.51, external: 2.19 }
```

**Calculating TVL:**  
Duration - 6 milliseconds  
Memory Usage (in MB):

```
Low { rss: 47.25, heapTotal: 10.84, heapUsed: 7.81, external: 0.64 }
High { rss: 175.39, heapTotal: 79.34, heapUsed: 47.51, external: 2.19 }
```
