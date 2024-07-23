const { memoryUsage } = require("node:process");

// Memory is in MB
const memoryLogRss = []; // Resident Set Size - total memory allocated for the process execution
const memoryLogHeapTotal = []; // total size of the allocated heap
const memoryLogHeapUsed = []; // actual memory used during the execution
const memoryLogExternal = []; // V8 external memory
const formatMemoryUsage = (data) =>
	Math.round((data / 1024 / 1024) * 100) / 100;
const getMemoryUsage = () => {
	const memoryData = memoryUsage();
	memoryLogRss.push(formatMemoryUsage(memoryData.rss));
	memoryLogHeapTotal.push(formatMemoryUsage(memoryData.heapTotal));
	memoryLogHeapUsed.push(formatMemoryUsage(memoryData.heapUsed));
	memoryLogExternal.push(formatMemoryUsage(memoryData.external));
};

const getHighestMemoryUsage = () => {
	const rss = Math.max(...memoryLogRss);
	const heapTotal = Math.max(...memoryLogHeapTotal);
	const heapUsed = Math.max(...memoryLogHeapUsed);
	const external = Math.max(...memoryLogExternal);
	console.log("High", { rss, heapTotal, heapUsed, external });
};

const getLowestMemoryUsage = () => {
	const rss = Math.min(...memoryLogRss);
	const heapTotal = Math.min(...memoryLogHeapTotal);
	const heapUsed = Math.min(...memoryLogHeapUsed);
	const external = Math.min(...memoryLogExternal);
	console.log("Low", { rss, heapTotal, heapUsed, external });
};

module.exports = {
	getMemoryUsage,
	getHighestMemoryUsage,
	getLowestMemoryUsage,
};
