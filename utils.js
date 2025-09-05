/**
 * =================================================================
 * SHARED UTILITY FUNCTIONS
 * =================================================================
 * This file contains common utility functions used across the application.
 *
 * How to use:
 * 1. Include this script AFTER config.js and BEFORE other app scripts in your HTML:
 *    <script src="config.js"></script>
 *    <script src="utils.js"></script>
 *    <script src="weather.js" defer></script>
 *    <script src="clock.js" defer></script>
 */

// --- Shared Constants ---
const MS_IN_SECOND = 1000;
const MS_IN_HOUR = 3600000;
const MS_IN_MINUTE = 60000;

/**
 * Adds a leading zero to single-digit numbers.
 * @param {number} num - The number to format.
 * @returns {string} Formatted number string.
 */
const addZero = (num) => String(num).padStart(2, '0');

/**
 * Gets the date string in YYYY-MM-DD format for the local timezone from a Date object.
 * @param {Date} date - The date object to format.
 * @returns {string} Date string (e.g., "2023-04-23").
 */
const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = addZero(date.getMonth() + 1);
    const day = addZero(date.getDate());
    return `${year}-${month}-${day}`;
};

/**
 * Calculates a future date string in YYYY-MM-DDTHH format.
 * @param {Date} baseDate - The starting date object.
 * @param {number} daysOffset - Number of days to add.
 * @param {number} hour - Specific hour (0-23). Must be provided.
 * @returns {string} Date string in YYYY-MM-DDTHH format (e.g., "2024-02-01T06").
 */
const getFutureDateString = (baseDate, daysOffset, hour) => {
    if (hour === undefined || hour === null || hour < 0 || hour > 23) {
        console.error("getFutureDateString requires a valid hour (0-23).");
        return "INVALID_DATE_FORMAT";
    }

    const targetDate = new Date(baseDate); // Create a copy to avoid modifying the original
    targetDate.setDate(targetDate.getDate() + daysOffset);

    const year = targetDate.getFullYear();
    const month = addZero(targetDate.getMonth() + 1);
    const day = addZero(targetDate.getDate());

    return `${year}-${month}-${day}T${addZero(hour)}`;
};
/**
 * A helper function to create a delay.
 * @param {number} ms - The number of milliseconds to wait.
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * A wrapper for the fetch API that includes automatic retry logic.
 * @param {string} url - The URL to fetch.
 * @param {object} [retryOptions={}] - Options for the retry mechanism.
 * @param {number} [retryOptions.maxRetries=3] - Maximum number of retries.
 * @param {number} [retryOptions.retryDelay=1000] - Delay between retries in ms.
 * @param {function} [retryOptions.onRetry] - Callback function executed on each retry attempt. It receives the attempt number and total retries.
 * @returns {Promise<any>} A promise that resolves with the parsed JSON data.
 * @throws {Error} Throws an error if all fetch attempts fail.
 */
const fetchWithRetry = async (url, { maxRetries = 3, retryDelay = 1000, onRetry = () => { } } = {}) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                // Throw an error for non-successful HTTP status codes to trigger the catch block
                throw new Error(`API request failed: ${response.status} ${response.statusText}`);
            }
            return await response.json(); // Success, parse and return JSON
        } catch (error) {
            console.error(`Fetch attempt ${attempt}/${maxRetries} for ${url} failed:`, error.message);
            if (attempt < maxRetries) {
                onRetry(attempt, maxRetries); // Execute the on-retry callback
                await delay(retryDelay); // Wait before the next attempt
            } else {
                throw new Error(`All ${maxRetries} fetch attempts failed for ${url}. Last error: ${error.message}`);
            }
        }
    }
};