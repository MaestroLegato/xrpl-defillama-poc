const rippleCodec = require("ripple-binary-codec");
const BigNumber = require("bignumber.js");

const NODE_URL = "https://xrplcluster.com";

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

const discoverPools = async (nextMarker, isBinary, atLedgerIndex) => {
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
      isBinary,
      atLedgerIndex
    );
    return [...poolsFound, ...poolsOnDeeperPages];
  }
  return poolsFound;
};

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

const getAllPoolsReserves = async (poolAddresses, atLedgerIndex) => {
  const poolsWithReserves = [];
  for (const pool of poolAddresses) {
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
  return xrpPools
    .reduce((total, pool) => total.plus(pool.tvl), new BigNumber(0))
    .plus(nonXrpPoolsTvl);
};

async function tvl(api) {
  const allPools = await discoverPools(null, 1);
  const poolsWithReserves = await getAllPoolsReserves(allPools);
  const totalTVL = getTotalTvl(poolsWithReserves);

  api.add("XRP", totalTVL);
}

module.exports = {
  methodology:
    "Finds all AMM pools on XRPL, checks their reserves, calculates TVL (in XRP) for each pool and sums them up.",
  start: 86795283,
  xrpl: {
    tvl,
  },
};
