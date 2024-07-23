const {
	getHighestMemoryUsage,
	getLowestMemoryUsage,
} = require("./debugMemory");

/**
 * Run function and measure its execution time and memory usage.
 * Must call getMemoryUsage inside recursive function to collect memory stats.
 * @param {function} fn - function to run
 * @return {*} Array of pool
 */
const runAndMeasure = async (description, fn, ...args) => {
	console.log("\n", description);
	const start = process.hrtime();
	const result = await fn(...args);
	const ms = process.hrtime(start)[1] / 1000000; // divide by a million to get nano to milli
	console.log(
		"Duration:",
		process.hrtime(start)[0] + "s " + ms.toFixed(0) + "ms"
	);
	console.log("Memory Usage:");
	getLowestMemoryUsage();
	getHighestMemoryUsage();
	return result;
};

module.exports = {
	runAndMeasure,
};
