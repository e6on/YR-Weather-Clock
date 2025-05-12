// --- Configuration ---
const API_URL = "https://api.met.no/weatherapi/locationforecast/2.0/complete";
const LATITUDE = 59.443;
const LONGITUDE = 24.738;
const THEME = "realistic"; // "yr", "anim", "realistic"
const NUM_OF_DAYS_FORECAST = 3; // Number of days beyond today
const WEATHER_CONTAINER_SELECTOR = ".maincontainer"; // Selector for the display element

// --- Constants ---
const IMAGE_EXT = THEME === "realistic" ? ".png" : ".svg";
const IMAGE_PATH = `./images/${THEME}/`;
const COMMON_IMAGE_PATH = './images/common/';
const MS_IN_MINUTE = 60000;
const MS_IN_HOUR = 3600000;
const MS_IN_DAY = 86400000;

// --- Constants for Retry ---
const MAX_FETCH_RETRIES = 3; // Maximum number of fetch attempts
const RETRY_DELAY_MS = 5000; // Delay between retries in milliseconds (e.g., 5 seconds)

// --- DOM Elements ---
// Cache the container element for efficiency
const weatherContainer = document.querySelector(WEATHER_CONTAINER_SELECTOR);
if (!weatherContainer) {
    console.error(`Error: Element with selector "${WEATHER_CONTAINER_SELECTOR}" not found.`);
    // Optionally, stop execution if the container is essential
    // throw new Error(`Weather container not found.`);
}

// --- Utility Functions ---

/**
 * Adds a leading zero to single-digit numbers.
 * @param {number} num - The number to format.
 * @returns {string} Formatted number string.
 */
const addZero = (num) => (num < 10 ? '0' : '') + num;

/**
 * Calculates a future date string in YYYY-MM-DDTHH format.
 * @param {Date} baseDate - The starting date object.
 * @param {number} daysOffset - Number of days to add.
 * @param {number} hour - Specific hour (0-23). Must be provided.
 * @returns {string} Date string in YYYY-MM-DDTHH format (e.g., "2024-02-01T06").
 */
const getFutureDateString = (baseDate, daysOffset, hour) => {
    // Ensure hour is provided, as the target format requires it.
    if (hour === undefined || hour === null || hour < 0 || hour > 23) {
        console.error("getFutureDateString requires a valid hour (0-23).");
        // Return a default/error indicator or throw an error
        return "INVALID_DATE_FORMAT";
        // Or: throw new Error("getFutureDateString requires a valid hour (0-23).");
    }

    const targetDate = new Date(baseDate.getTime() + daysOffset * MS_IN_DAY);

    // Adjust for timezone offset to get correct date part relative to local time
    // before converting to ISO string (which is UTC based)
    const adjustedDate = new Date(targetDate.getTime() - targetDate.getTimezoneOffset() * MS_IN_MINUTE);

    const isoString = adjustedDate.toISOString(); // e.g., "2024-02-01T10:30:00.000Z"

    // Extract the date part "YYYY-MM-DD"
    const datePart = isoString.slice(0, 10);

    // Combine date part with "T" and the zero-padded hour
    return `${datePart}T${addZero(hour)}`; // e.g., "2024-02-01T06"
};

/**
 * Formats an ISO date string (like "2024-02-01T13:00:00Z") into Estonian locale format.
 * @param {string} isoString - The ISO date string.
 * @returns {string} Formatted date string (e.g., "&nbsp;<span>N</span>&nbsp;&nbsp;1&nbsp;VEEBR").
 */
const formatDateEstonian = (isoString) => {
    try {
        const date = new Date(isoString);
        // No need to manually adjust timezone offset if using localeString options correctly
        const dayInitial = date.toLocaleDateString('et-EE', { weekday: 'short' }).charAt(0).toUpperCase();
        const dayOfMonth = date.getDate();
        const monthName = date.toLocaleDateString('et-EE', { month: 'short' }).toUpperCase().replace('.', ''); // Remove dot if present

        return `&nbsp;<span>${dayInitial}</span>&nbsp;&nbsp;${dayOfMonth}&nbsp;${monthName}`;
    } catch (e) {
        console.error("Error formatting date:", isoString, e);
        return "Invalid Date";
    }
};

/**
 * Extracts specific keys from a timeData object's details or summary for a given duration.
 * @param {object} timeData - A single timeseries entry from the API.
 * @param {string} duration - e.g., "instant", "next_1_hours".
 * @param {string[]} keys - Array of keys to extract (e.g., ["air_temperature"]).
 * @returns {object} Object containing found key-value pairs.
 */
const extractValues = (timeData, duration, keys) => {
    const results = {};
    const dataBlock = timeData?.data?.[duration]; // Use optional chaining

    if (!dataBlock) return results; // No data for this duration

    for (const key of keys) {
        if (dataBlock.summary && Object.hasOwn(dataBlock.summary, key)) {
            results[key] = dataBlock.summary[key];
        } else if (dataBlock.details && Object.hasOwn(dataBlock.details, key)) {
            results[key] = dataBlock.details[key];
        }
    }
    return results;
};

/**
 * Finds the timeseries entry closest to the target timeKey and extracts values.
 * Implements fallback to nearest standard forecast hour (00, 06, 12, 18) if exact hour not found.
 * @param {object[]} timeseries - The array of timeseries data from the API.
 * @param {string} timeKey - The target time key (e.g., "2024-02-02T14").
 * @param {string} duration - The forecast duration (e.g., "next_1_hours").
 * @param {string[]} keys - Keys to extract.
 * @returns {object | null} Extracted values or null if no suitable data found.
 */
const findAndExtractValues = (timeseries, timeKey, duration, keys) => {
    // 1. Try exact match
    for (const timeData of timeseries) {
        if (timeData.time.startsWith(timeKey)) {
            const values = extractValues(timeData, duration, keys);
            // Ensure we actually got *some* of the requested keys for this duration
            if (Object.keys(values).length > 0) {
                console.log(`Exact match found for ${timeKey}, duration ${duration}`);
                return values;
            }
        }
    }
    console.log(`No exact match or no relevant data for ${timeKey}, duration ${duration}. Trying fallback.`);


    // 2. Try fallback to nearest previous standard hour (00, 06, 12, 18) on the same day
    const targetHour = parseInt(timeKey.split('T')[1], 10);
    const targetDateStr = timeKey.split('T')[0];
    let fallbackHourStr = null;

    if (targetHour >= 18) fallbackHourStr = '18';
    else if (targetHour >= 12) fallbackHourStr = '12';
    else if (targetHour >= 6) fallbackHourStr = '06';
    else if (targetHour >= 0) fallbackHourStr = '00';

    if (fallbackHourStr) {
        const fallbackTimeKey = `${targetDateStr}T${fallbackHourStr}`;
        console.log(`Falling back to check ${fallbackTimeKey}`);
        for (const timeData of timeseries) {
            if (timeData.time.startsWith(fallbackTimeKey)) {
                const values = extractValues(timeData, duration, keys);
                if (Object.keys(values).length > 0) {
                    console.log(`Fallback match found at ${fallbackTimeKey} for original ${timeKey}, duration ${duration}`);
                    return values;
                }
            }
        }
    }

    console.warn(`No data found for timeKey "${timeKey}" or fallback for duration "${duration}".`);
    return null; // Indicate no data found
};

/**
 * Formats temperature value into HTML with integer and decimal parts.
 * @param {number | undefined} temp - The temperature value.
 * @returns {string} HTML string for temperature display.
 */
const formatTemperatureHTML = (temp) => {
    if (temp === undefined || temp === null) return "<div class='temp'>--&deg;</div>"; // Handle missing temp

    const tempString = temp.toString();
    const [integerPart, decimalPart] = tempString.split('.');
    const decimalDisplay = decimalPart ? `.${decimalPart}` : '.0';

    return `<div class='temp'>
                <div class='t1'>${integerPart}</div>
                <div class='tempsplit deg'>&deg;</div>
                <div class='tempsplit t2'>${decimalDisplay}</div>
            </div>`;
};

/**
 * Adjusts symbol code to use "_day" variant if current time is daytime.
 * @param {string} symbolCode - Original symbol code.
 * @param {Date} currentTime - The current time.
 * @param {object} sunTimes - Object with sunrise and sunset Date objects.
 * @returns {string} Adjusted symbol code.
 */
const adjustSymbolForDaytime = (symbolCode, currentTime, sunTimes) => {
    if (!symbolCode) return 'default'; // Handle missing symbol code
    const currentMillis = currentTime.getTime();
    const sunriseMillis = sunTimes.sunrise.getTime();
    const sunsetMillis = sunTimes.sunset.getTime();

    if (currentMillis > sunriseMillis && currentMillis < sunsetMillis) {
        return symbolCode.replace('_night', '_day');
    }
    return symbolCode;
};

/**
 * Generates HTML for the current weather conditions.
 * @param {object} instantData - Data for 'instant'.
 * @param {object} next1hData - Data for 'next_1_hours'.
 * @param {Date} currentTime - Current time.
 * @param {object} sunTimes - Sunrise/sunset times.
 * @returns {string} HTML string.
 */
const createCurrentWeatherHTML = (instantData, next1hData, currentTime, sunTimes) => {
    const temp = instantData?.air_temperature;
    const windSpeed = instantData?.wind_speed;
    const symbolCode1h = next1hData?.symbol_code;
    const precipitationProb = next1hData?.probability_of_precipitation;

    const adjustedSymbol1h = adjustSymbolForDaytime(symbolCode1h, currentTime, sunTimes);
    const conditionImage = `<img class='conditionpic' src='${IMAGE_PATH}${adjustedSymbol1h}${IMAGE_EXT}' alt='${adjustedSymbol1h || 'Weather icon'}' />`;
    const temperatureHTML = formatTemperatureHTML(temp);

    let windIcon = 'wind';
    // Use specific wind icons only if wind speed is defined and within range 0-12
    if (windSpeed !== undefined && windSpeed >= 0 && windSpeed < 13) {
        windIcon = `wind-${Math.floor(windSpeed)}`; // Use integer part for icon name
    }
    const windHTML = `<img class='icon image1' src='${COMMON_IMAGE_PATH}${windIcon}.svg' alt='wind' /><div>${windSpeed ?? '--'}<sup>m/s</sup></div>`; // Use ?? for nullish coalescing

    const thunderIcon = (adjustedSymbol1h && adjustedSymbol1h.includes("thunder"))
        ? `<img class='icon image2' src='${COMMON_IMAGE_PATH}thunder.svg' alt='thunder' />`
        : "";
    const precipitationHTML = `<div class='parent'><img class='icon' src='${COMMON_IMAGE_PATH}umbrella.svg' alt='umbrella' />${thunderIcon}</div><div>${precipitationProb ?? '--'}<sup>%</sup></div>`;

    return `<div class='daycontainer'>
                <div class='item propscontainer'>
                    ${windHTML}
                    ${precipitationHTML}
                </div>
                ${conditionImage}
                ${temperatureHTML}
            </div>`;
};

/**
 * Generates HTML for a single forecast day (today or future).
 * @param {string} isoDateTimeString - ISO string for the forecast time (e.g., "2024-02-02T06:00:00Z").
 * @param {object} forecastData6h - Data for 'next_6_hours'.
 * @param {object} [forecastData12h] - Optional data for 'next_12_hours'.
 * @param {Date} currentTime - Current time (used for today's forecast).
 * @param {object} sunTimes - Sunrise/sunset times.
 * @param {boolean} isTodaySummary - Flag if this is the summary part for today.
 * @returns {string} HTML string.
 */
const createForecastDayHTML = (isoDateTimeString, forecastData6h, forecastData12h, currentTime, sunTimes, isTodaySummary = false) => {
    const maxTemp = forecastData6h?.air_temperature_max;
    const minTemp = forecastData6h?.air_temperature_min;
    // Prioritize 12h symbol if available, otherwise use 6h
    let symbolCode = forecastData12h?.symbol_code ?? forecastData6h?.symbol_code;

    // Adjust symbol: Use daytime for future days, adjust based on current time for today's summary
    if (symbolCode) {
        symbolCode = isTodaySummary
            ? adjustSymbolForDaytime(symbolCode, currentTime, sunTimes)
            : symbolCode.replace('_night', '_day'); // Assume daytime for future forecast summaries
    } else {
        symbolCode = 'default'; // Fallback symbol
    }


    const timeHTML = `<div class='item time'>${formatDateEstonian(isoDateTimeString)}</div>`;
    const conditionImage = `<img class='conditionpic' src='${IMAGE_PATH}${symbolCode}${IMAGE_EXT}' alt='${symbolCode}' />`;
    const maxTempHTML = `<div class='item tempmax'>${maxTemp ?? '--'}&deg;</div>`; // Use ??
    const minTempHTML = `<div class='item tempmin'>${minTemp ?? '--'}&deg;</div>`; // Use ??

    const containerClass = 'daycontainer';

    return `<div class='${containerClass}'>
                ${timeHTML}
                ${conditionImage}
                ${maxTempHTML}
                ${minTempHTML}
            </div>`;
};


/**
 * Updates the display with status messages or error messages.
 * @param {string} message - The message to display.
 * @param {boolean} isError - If true, style as an error.
 */
const updateStatus = (message, isError = false) => {
    if (!weatherContainer) return; // Don't try to update if container doesn't exist
    console.log(isError ? "Error:" : "Status:", message);
    weatherContainer.innerHTML = message;
    weatherContainer.style.color = isError ? 'red' : 'inherit'; // Simple error styling
};

// --- Main Weather Fetching and Display Logic ---
const fetchAndDisplayWeather = async (currentAttempt = 1) => {
    const now = new Date();
    // Base date for calculations, adjusted for timezone for correct date part
    const baseDateForISO = new Date(now.getTime() - now.getTimezoneOffset() * MS_IN_MINUTE);

    const apiUrl = `${API_URL}?lat=${LATITUDE}&lon=${LONGITUDE}`;
    console.log(`Fetching weather data... (Attempt ${currentAttempt}/${MAX_FETCH_RETRIES})`);

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();

        if (!data?.properties?.timeseries) {
            throw new Error("Invalid API response structure.");
        }
        const timeseries = data.properties.timeseries;

        // --- Get Sun Times ---
        updateStatus("Calculating sun times...");
        const sunTimes = SunCalc.getTimes(now, LATITUDE, LONGITUDE);
        console.log(`Sunrise: ${sunTimes.sunrise}, Sunset: ${sunTimes.sunset}`);

        // --- Process Today's Weather ---
        updateStatus("Processing today's weather...");
        const todayHourKey = getFutureDateString(baseDateForISO, 0, now.getHours()); // e.g., "2024-02-02T14"
        console.log(`DATE TODAY:`, todayHourKey);
        const todayISOString = `${todayHourKey}:00:00Z`; // For formatting

        const todayInstant = findAndExtractValues(timeseries, todayHourKey, "instant", ["air_temperature", "wind_speed"]);
        const todayNext1h = findAndExtractValues(timeseries, todayHourKey, "next_1_hours", ["symbol_code", "probability_of_precipitation"]);
        const todayNext6h = findAndExtractValues(timeseries, todayHourKey, "next_6_hours", ["air_temperature_max", "air_temperature_min", "symbol_code"]);

        let combinedHTML = "";

        // Create HTML for current conditions
        combinedHTML += createCurrentWeatherHTML(todayInstant, todayNext1h, now, sunTimes);

        // Create HTML for today's forecast summary (using 6h data)
        if (todayNext6h) {
            combinedHTML += createForecastDayHTML(todayISOString, todayNext6h, null, now, sunTimes, true); // Pass true for isTodaySummary
        } else {
            console.warn("Could not get 6-hour forecast data for today's summary.");
        }


        // --- Process Future Days ---
        updateStatus(`Processing forecast for ${NUM_OF_DAYS_FORECAST} day(s)...`);
        let futureForecastHTML = "";
        for (let j = 1; j <= NUM_OF_DAYS_FORECAST; j++) {
            // Target 6 AM for the daily forecast summary
            const dayForecastKey = getFutureDateString(baseDateForISO, j, 6); // e.g., "2024-02-03T06"
            console.log(`DATE FUTURE:`, dayForecastKey);
            const dayISOString = `${dayForecastKey}:00:00Z`; // For formatting

            updateStatus(`Processing forecast for ${formatDateEstonian(dayISOString)}...`);

            const futureNext6h = findAndExtractValues(timeseries, dayForecastKey, "next_6_hours", ["air_temperature_max", "air_temperature_min", "symbol_code"]);
            const futureNext12h = findAndExtractValues(timeseries, dayForecastKey, "next_12_hours", ["symbol_code"]);

            if (futureNext6h) { // Need at least 6h data to show anything meaningful
                futureForecastHTML += createForecastDayHTML(dayISOString, futureNext6h, futureNext12h, now, sunTimes);
            } else {
                console.warn(`Could not get 6-hour forecast data for ${dayForecastKey}. Skipping day.`);
                // Optionally add a placeholder: 
                futureForecastHTML += `<div>No forecast available for ${formatDateEstonian(dayISOString)}</div>`;
            }
        }

        // --- Update DOM ---
        updateStatus("Displaying weather...");
        if (weatherContainer) {
            weatherContainer.innerHTML = combinedHTML + futureForecastHTML;
            weatherContainer.style.color = 'inherit'; // Reset color if it was set to red
        }
        console.log("Weather refreshed successfully at " + new Date());

    } catch (error) {
        console.error(`Failed to fetch or process weather data (attempt ${currentAttempt}/${MAX_FETCH_RETRIES}):`, error);
        if (currentAttempt < MAX_FETCH_RETRIES) {
            const nextAttempt = currentAttempt + 1;
            updateStatus(`Failed to load weather. Retrying in ${RETRY_DELAY_MS / 1000}s... (Attempt ${nextAttempt}/${MAX_FETCH_RETRIES})`, true);
            setTimeout(() => fetchAndDisplayWeather(nextAttempt), RETRY_DELAY_MS);
        } else {
            console.error("All retries failed for weather data.");
            updateStatus(`ERROR: Failed to load weather after ${MAX_FETCH_RETRIES} attempts. ${error.message}`, true);
        }
    }
};

// --- Initial Load ---
// Ensure SunCalc is loaded before running
if (typeof SunCalc !== 'undefined') {
    fetchAndDisplayWeather(); // Initial call, will use default currentAttempt = 1
    // Optional: Set an interval to refresh the weather periodically
    // Each call from setInterval will also start with attempt 1 for its refresh cycle
    setInterval(() => fetchAndDisplayWeather(), 30 * MS_IN_MINUTE); // Refresh every 30 minutes
} else {
    updateStatus("Error: SunCalc library not loaded.", true);
}
