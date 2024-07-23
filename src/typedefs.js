/**
 * A single state object inside rippled
 * @typedef {Object} LedgerStateObjectBinary
 * @property {string} data - Binary encoded data of the state object
 * @property {string} index - Index ID of a state object in rippled db (not used in this script)
 */

/**
 * A (partial) response from ledger_data rippled method
 * @typedef {Object} LedgerDataResponse
 * @property {Array.<LedgerStateObjectBinary>} state - Array of state objects returned from rippled
 * @property {string} marker - The pagination marker to be used to retrieve next chunk of state objects
 */

/**
 * An asset representation in raw rippled response
 * @typedef {Object} RawXRPLAsset
 * @property {string} currency - The name (symbol) of a token
 * @property {string|undefined} issuer - Issuer address of a token
 */

/**
 * An AMM pool representation in raw rippled response
 * @typedef {Object} RawXRPLPool
 * @property {string} account - Pool address
 * @property {RawXRPLAsset} asset1 - Asset 1 in the pool
 * @property {RawXRPLAsset} asset2 - Asset 2 in the pool
 */

/**
 * A token (i.e. not XRP coin) representation in XRPL
 * @typedef {Object} NonXrpToken
 * @property {string} currency - The name (symbol) of a token
 * @property {string} issuer - Issuer address of a token
 * @property {string} value - amount of an token as string
 */

/**
 * A token or XRP coin representation in XRPL
 * @typedef {Object} TokenAndReserves
 * @property {string} currency - The name (symbol) of a token
 * @property {string|null} issuer - Issuer address of a token (null for XRP)
 * @property {BigNumber} amount - BigNumber amount of an asset (as-is for tokens, converted from drops to XRP for XRP)
 */

/**
 * A formatted response from amm_info rippled method, representing the amount of token0 and token1 in a pool
 * @typedef {Object} PoolReservesResponse
 * @property {TokenAndReserves} token0 - Reserves of token0
 * @property {TokenAndReserves} token1 - Reserves of token1
 */

/**
 * A representation of an AMM pool on XRPL, including its reserves and tvl (in XRP)
 * @typedef {Object} PoolWithReserves
 * @property {string} pool - Pool address
 * @property {TokenAndReserves} token0Reserve - Reserves of token0
 * @property {TokenAndReserves} token1Reserve - Reserves of token0
 * @property {BigNumber} tvl - TVL of the pool expressed in XRP
 */
