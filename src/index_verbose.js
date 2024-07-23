/// <reference path="typedefs.js" />
const rippleCodec = require("ripple-binary-codec");
const BigNumber = require("bignumber.js");
const { getMemoryUsage } = require("./debugTools/debugMemory");
const { runAndMeasure } = require("./debugTools/debug");
const assert = require("assert");

const NODE_URL = "https://xrplcluster.com";

/**
 * This is a verbose implementation of the TVL-fetching script.
 * It includes typing, memory usage tracking, etc.
 * Uncomment the desired test to run at the bottom of this file.
 * For the "production" version see index.js
 */

/**
 * Makes a request to rippled node to fetch ledger data for AMM pool objects
 * @param {boolean} binary - Whether to request binary data or json data from rippled
 * @param {string} marker - pagination marker for the request
 * @param {number|undefined} atLedgerIndex - the ledger index at which to request the data. "undefined" for latest validated ledger
 * @return {Promise<LedgerDataResponse>} Object containing array of state objects and a maker for the next request
 */
const fetchLedgerData = async (binary, marker, atLedgerIndex) => {
  const xrplResponse = await fetch(NODE_URL, {
    method: "POST",
    body: JSON.stringify({
      method: "ledger_data",
      params: [
        {
          ledger_index: atLedgerIndex ?? "validated",
          binary,
          type: "amm",
          ...(marker && { marker: marker }),
        },
      ],
    }),
  });
  const xrplResponseJson = await xrplResponse.json();
  return {
    state: xrplResponseJson.result.state,
    marker: xrplResponseJson.result.marker,
  };
};

/**
 * Makes a request to rippled node to fetch data about specific AMM pool (i.e. reserves)
 * @param {RawXRPLPool} pool - XRPL AMM pool
 * @param {number|undefined} atLedgerIndex - the ledger index at which to request the data. "undefined" for latest validated ledger
 * @return {Promise<PoolReservesResponse>} - Reserves of the pool
 */
const fetchPoolReserves = async (pool, atLedgerIndex) => {
  const xrplResponse = await fetch(NODE_URL, {
    method: "POST",
    body: JSON.stringify({
      method: "amm_info",
      params: [
        {
          ledger_index: atLedgerIndex ?? "validated",
          asset: pool.asset1,
          asset2: pool.asset2,
        },
      ],
    }),
  });
  const xrplResponseJson = await xrplResponse.json();
  return {
    token0: parseReserve(xrplResponseJson.result.amm.amount),
    token1: parseReserve(xrplResponseJson.result.amm.amount2),
  };
};

/**
 * Discover active AMM pools on XRPL. Uses binary format
 * @param {string} nextMarker - The first color, in hexadecimal format.
 * @param {string} debugIter - Debug integer showing which iteration we are on
 * @return {Promise<Array.<RawXRPLPool>>} Array of pool
 */
const discoverPools = async (
  nextMarker,
  debugIter,
  isBinary,
  atLedgerIndex
) => {
  getMemoryUsage();
  console.log("Iteration", debugIter);
  // if (debugIter > 50) {
  // 	return [];
  // }
  const { state, marker } = await fetchLedgerData(
    isBinary,
    nextMarker,
    atLedgerIndex
  );
  const poolsFound = []; // holds pools found on this page + subsequent joining with deeper pages
  if (state && state.length != 0) {
    const decodedState = isBinary
      ? state.map((entry) => rippleCodec.decode(entry.data))
      : state;
    poolsFound.push(
      ...decodedState.map((entry) => ({
        account: entry.Account,
        asset1: {
          currency: entry.Asset.currency,
          issuer: entry.Asset.issuer,
        },
        asset2: {
          currency: entry.Asset2.currency,
          issuer: entry.Asset2.issuer,
        },
      }))
    );
  }
  if (marker) {
    const poolsOnDeeperPages = await discoverPools(
      marker,
      debugIter + 1,
      isBinary,
      atLedgerIndex
    );
    return [...poolsFound, ...poolsOnDeeperPages];
  }
  console.log("No more markers");
  return poolsFound;
};

/**
 * Parses raw rippled balance of a token to a unified format for both XRP and non-XRP
 * @param {string|NonXrpToken} reserveData - String for XRP reserve in drops, NonXrpToken for token reserve
 * @return {TokenAndReserves} - TokenAndReserves object
 */
const parseReserve = (reserveData) => {
  const reserveIsXrp = typeof reserveData === "string";
  return {
    currency: reserveIsXrp ? "XRP" : reserveData.currency,
    issuer: reserveIsXrp ? null : reserveData.issuer,
    amount: reserveIsXrp
      ? new BigNumber(reserveData, 10).div(1_000_000) // Converting drops to XRP
      : new BigNumber(reserveData.value),
  };
};

/**
 * Parses raw rippled balance of a token to a unified format for both XRP and non-XRP
 * @param {Array.<RawXRPLPool>} poolAddresses - Array of pool addresses
 * @param {number|undefined} atLedgerIndex - the ledger index at which to request the data. "undefined" for latest validated ledger
 * @return {Promise<Array.<PoolWithReserves>>} - array of pools and its reserves
 */
const getAllPoolsReserves = async (poolAddresses, atLedgerIndex) => {
  const poolsWithReserves = [];
  for (const pool of poolAddresses) {
    getMemoryUsage();
    const { token0, token1 } = await fetchPoolReserves(pool, atLedgerIndex);
    poolsWithReserves.push({
      pool: pool.account,
      token0Reserve: token0,
      token1Reserve: token1,
      tvl:
        token0.currency === "XRP"
          ? token0.amount.multipliedBy(2)
          : token1.currency === "XRP"
          ? token1.amount.multipliedBy(2)
          : new BigNumber(0),
    });
  }
  return poolsWithReserves;
};

const REFERENCE_THRESHOLD = 40_000; // 40,000 XRP
const calculateXrpTvlForNonXrpPools = (xrpPools, nonXrpPools) => {
  const findXrpPool = (currency, issuer) =>
    xrpPools.find(
      (xrpPool) =>
        (xrpPool.token0Reserve.currency === currency &&
          xrpPool.token0Reserve.issuer === issuer) ||
        (xrpPool.token1Reserve.currency === currency &&
          xrpPool.token1Reserve.issuer === issuer)
    );
  for (let i in nonXrpPools) {
    const xrpPoolForToken0 = findXrpPool(
      nonXrpPools[i].token0Reserve.currency,
      nonXrpPools[i].token0Reserve.issuer
    );
    const xrpPoolForToken1 = findXrpPool(
      nonXrpPools[i].token1Reserve.currency,
      nonXrpPools[i].token1Reserve.issuer
    );
    let referencePool = undefined;
    if (xrpPoolForToken0 && xrpPoolForToken1) {
      referencePool =
        xrpPoolForToken0.tvl > xrpPoolForToken1.tvl
          ? xrpPoolForToken0
          : xrpPoolForToken1;
    } else {
      referencePool = xrpPoolForToken0 || xrpPoolForToken1;
    }
    if (referencePool && referencePool.tvl.gte(REFERENCE_THRESHOLD)) {
      const xrpInReferencePool =
        referencePool.token0Reserve.currency === "XRP"
          ? referencePool.token0Reserve.amount
          : referencePool.token1Reserve.amount;
      const tokenInReferencePool =
        referencePool.token0Reserve.currency !== "XRP"
          ? referencePool.token0Reserve
          : referencePool.token1Reserve;
      const xrpPerToken = xrpInReferencePool.div(tokenInReferencePool.amount);
      const currentPoolTokenXrpValue =
        nonXrpPools[i].token0Reserve.currency === tokenInReferencePool.currency
          ? nonXrpPools[i].token0Reserve.amount.multipliedBy(xrpPerToken)
          : nonXrpPools[i].token1Reserve.amount.multipliedBy(xrpPerToken);
      nonXrpPools[i].tvl = currentPoolTokenXrpValue.multipliedBy(2);
    }
  }
  return nonXrpPools.reduce((total, pool) => {
    return total.plus(pool.tvl);
  }, new BigNumber(0));
};

const getTotalTvl = (poolsWithReserves) => {
  const { xrpPools, nonXrpPools } = poolsWithReserves.reduce(
    (acc, pool) => {
      const isXrpPool =
        pool.token0Reserve.currency === "XRP" ||
        pool.token1Reserve.currency === "XRP";
      acc[isXrpPool ? "xrpPools" : "nonXrpPools"].push(pool);
      return acc;
    },
    { xrpPools: [], nonXrpPools: [] }
  );

  const nonXrpPoolsTvl = calculateXrpTvlForNonXrpPools(xrpPools, nonXrpPools);
  getMemoryUsage();
  const totalTvl = xrpPools
    .reduce((total, pool) => total.plus(pool.tvl), new BigNumber(0))
    .plus(nonXrpPoolsTvl);
  getMemoryUsage();
  console.log({
    TotalTVL: totalTvl.toString(),
    NonXrpPairsTVL: nonXrpPoolsTvl.toString(),
  });
  return totalTvl;
};

const runAndMeasurePerformance = async () => {
  const atLedgerIndex = 86799000;
  const allPools = await runAndMeasure(
    ">>> Pool Discovery",
    discoverPools,
    null,
    1,
    true,
    atLedgerIndex
  );

  const poolsWithReserves = await runAndMeasure(
    ">>> Get All Pools Reserves",
    getAllPoolsReserves,
    allPools,
    atLedgerIndex
  );

  runAndMeasure(">>> Get Total TVL", getTotalTvl, poolsWithReserves);
};

const runWithoutMeasurements = async () => {
  try {
    const allPools = await discoverPools(null, 1);
    const poolsWithReserves = await getAllPoolsReserves(allPools);
    getTotalTvl(poolsWithReserves);
  } catch (e) {
    console.error("Failed to get TVL for XRPL", e);
  }
};

// Simple sanity tests
const unitTests = () => {
  const xrpPools = [
    {
      address: "XRP_USD",
      token0Reserve: {
        currency: "XRP",
        issuer: null,
        amount: new BigNumber(21_000),
      },
      token1Reserve: {
        currency: "USD",
        issuer: "usdissuer",
        amount: new BigNumber(10_500),
      },
      tvl: new BigNumber(42_000),
    },
    {
      address: "XRP_KEK",
      token0Reserve: {
        currency: "XRP",
        issuer: null,
        amount: new BigNumber(30_000),
      },
      token1Reserve: {
        currency: "KEK",
        issuer: "KEKissuer",
        amount: new BigNumber(90_000),
      },
      tvl: new BigNumber(60_000),
    },
  ];
  const nonXrpPools = [
    {
      address: "XYZ_USD",
      token0Reserve: {
        currency: "XYZ",
        issuer: "XYZissuer",
        amount: new BigNumber(1000),
      },
      token1Reserve: {
        currency: "USD",
        issuer: "usdissuer",
        amount: new BigNumber(5000),
      },
      tvl: new BigNumber(0),
    },
    {
      address: "KEK_USD",
      token0Reserve: {
        currency: "KEK",
        issuer: "KEKissuer",
        amount: new BigNumber(30_000),
      },
      token1Reserve: {
        currency: "USD",
        issuer: "usdissuer",
        amount: new BigNumber(5_000), // should be 0.1666666667 USD per KEK
      },
      tvl: new BigNumber(0), // should end up ~10k XPR
    },
  ];
  const nonXrpPoolsWithTvl = calculateXrpTvlForNonXrpPools(
    xrpPools,
    nonXrpPools
  );
  assert(nonXrpPoolsWithTvl.isEqualTo(new BigNumber("39999.9999999999999998")));
};

/**
 * Uncomment the desired test to run
 */
runAndMeasurePerformance();
// runWithoutMeasurements();
// unitTests();
