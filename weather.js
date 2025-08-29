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

// --- API Data Constants ---
const API_KEYS = {
    // Instant
    AIR_TEMP: "air_temperature",
    WIND_SPEED: "wind_speed",
    // Next 1 hour
    SYMBOL_CODE: "symbol_code",
    PRECIP_PROB: "probability_of_precipitation",
    // Next 6/12 hours
    AIR_TEMP_MAX: "air_temperature_max",
    AIR_TEMP_MIN: "air_temperature_min",
};
const API_DURATIONS = {
    INSTANT: "instant",
    NEXT_1_H: "next_1_hours",
    NEXT_6_H: "next_6_hours",
    NEXT_12_H: "next_12_hours",
};

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
const addZero = (num) => String(num).padStart(2, '0');

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
 * Estonian short month names for robust formatting.
 */
const ESTONIAN_SHORT_MONTHS = ['JAAN', 'VEEBR', 'MÄRTS', 'APR', 'MAI', 'JUUNI', 'JUULI', 'AUG', 'SEPT', 'OKT', 'NOV', 'DETS'];

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
        const monthIndex = date.getMonth(); // 0-11
        const monthName = ESTONIAN_SHORT_MONTHS[monthIndex];

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
    const maxTemp = forecastData6h?.air_temperature_max !== undefined ? Math.round(forecastData6h.air_temperature_max) : undefined;
    const minTemp = forecastData6h?.air_temperature_min !== undefined ? Math.round(forecastData6h.air_temperature_min) : undefined;
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
 * Generates the HTML for a single skeleton-loader item.
 * @param {boolean} isCurrent - True for the current weather item, false for a forecast item.
 * @returns {string} HTML string for a skeleton item.
 */
const createSkeletonItemHTML = (isCurrent) => {
    if (isCurrent) {
        return `
            <div class="daycontainer skeleton-item skeleton-item-current">
                <div class="item propscontainer skeleton-head">
                    <div class="skeleton-line" style="width: 170px; height: 1em; margin-bottom: 5px;"></div>
                </div>
                <div class="skeleton-box skeleton-condimage"></div>
                <div class="skeleton-box skeleton-temp-large"></div>
            </div>`;
    }
    return `
        <div class="daycontainer skeleton-item skeleton-item-forecast">
            <div class="item time skeleton-head skeleton-time skeleton-line"></div>
            <div class="skeleton-box skeleton-condimage"></div>
            <div class="skeleton-line skeleton-tmax"></div>
            <div class="skeleton-line skeleton-tmin"></div>
        </div>`;
};

/**
 * Renders a skeleton loader UI in the weather container.
 */
const displaySkeletonLoader = () => {
    if (!weatherContainer) return;

    let skeletonHTML = createSkeletonItemHTML(true); // Current weather
    // +1 for today's summary forecast
    for (let i = 0; i < NUM_OF_DAYS_FORECAST + 1; i++) {
        skeletonHTML += createSkeletonItemHTML(false);
    }

    // The CSS in weather.css uses a `.weather-skeleton` class on the container
    // to apply the pulsing animation to children.
    weatherContainer.classList.add('weather-skeleton');
    weatherContainer.innerHTML = skeletonHTML;
};

/**
 * Updates the display with status messages or error messages.
 * @param {string} message - The message to display.
 * @param {boolean} isError - If true, style as an error.
 */
const updateStatus = (message, isError = false) => {
    console.log(isError ? "Error:" : "Status:", message);
    // Only update the DOM for critical errors, as the skeleton loader handles the loading state.
    if (isError && weatherContainer) {
        weatherContainer.classList.remove('weather-skeleton'); // Remove skeleton styling
        weatherContainer.innerHTML = `<div style="text-align: center; padding: 20px;">${message}</div>`;
        weatherContainer.style.color = 'red';
    }
};

/**
 * Renders the complete weather forecast UI from processed data.
 * @param {object} weatherData - An object containing all necessary data for rendering.
 */
const renderWeather = (weatherData) => {
    if (!weatherContainer) return;

    const { current, todaySummary, forecasts, sunTimes, now } = weatherData;

    // Create HTML for current conditions
    const currentWeatherHTML = createCurrentWeatherHTML(current.instant, current.next1h, now, sunTimes);

    // Create HTML for today's forecast summary
    let todaySummaryHTML = "";
    if (todaySummary.next6h) {
        todaySummaryHTML = createForecastDayHTML(todaySummary.isoString, todaySummary.next6h, null, now, sunTimes, true);
    } else {
        console.warn("Could not get 6-hour forecast data for today's summary.");
    }

    // Create HTML for future days
    const futureForecastHTML = forecasts.map(day => {
        if (day.next6h) {
            // Pass `now` and `sunTimes` though they are only used for today's summary, for function signature consistency
            return createForecastDayHTML(day.isoString, day.next6h, day.next12h, now, sunTimes);
        }
        console.warn(`Could not get 6-hour forecast data for ${day.key}. Skipping day.`);
        return `<div class="daycontainer" style="align-items: center; justify-content: center; color: #777;">
                    <div class='item time'>${formatDateEstonian(day.isoString)}</div>
                    <div>No forecast</div>
                </div>`;
    }).join('');

    // --- Update DOM ---
    weatherContainer.classList.remove('weather-skeleton');
    weatherContainer.innerHTML = currentWeatherHTML + todaySummaryHTML + futureForecastHTML;
    console.log("Weather refreshed successfully at " + new Date());
};

// --- Main Weather Fetching and Display Logic ---
const fetchAndDisplayWeather = async (currentAttempt = 1) => {
    const now = new Date();

    const apiUrl = `${API_URL}?lat=${LATITUDE}&lon=${LONGITUDE}`;

    // Display skeleton loader on first attempt of a fetch cycle
    if (currentAttempt === 1) {
        displaySkeletonLoader();
    }

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
        const sunTimes = SunCalc.getTimes(now, LATITUDE, LONGITUDE);
        console.log(`Sunrise: ${sunTimes.sunrise}, Sunset: ${sunTimes.sunset}`);

        // --- Process Today's Weather ---
        const todayHourKey = getFutureDateString(now, 0, now.getHours()); // e.g., "2024-02-02T14"
        console.log(`DATE TODAY:`, todayHourKey);
        const todayISOString = `${todayHourKey}:00:00Z`; // For formatting

        const weatherData = {
            now,
            sunTimes,
            current: {
                instant: findAndExtractValues(timeseries, todayHourKey, API_DURATIONS.INSTANT, [API_KEYS.AIR_TEMP, API_KEYS.WIND_SPEED]),
                next1h: findAndExtractValues(timeseries, todayHourKey, API_DURATIONS.NEXT_1_H, [API_KEYS.SYMBOL_CODE, API_KEYS.PRECIP_PROB]),
            },
            todaySummary: {
                isoString: todayISOString,
                next6h: findAndExtractValues(timeseries, todayHourKey, API_DURATIONS.NEXT_6_H, [API_KEYS.AIR_TEMP_MAX, API_KEYS.AIR_TEMP_MIN, API_KEYS.SYMBOL_CODE]),
            },
            forecasts: []
        };

        // --- Process Future Days ---
        for (let j = 1; j <= NUM_OF_DAYS_FORECAST; j++) {
            // Target 6 AM for the daily forecast summary
            const dayForecastKey = getFutureDateString(now, j, 6); // e.g., "2024-02-03T06"
            console.log(`DATE FUTURE:`, dayForecastKey);
            const dayISOString = `${dayForecastKey}:00:00Z`; // For formatting

            weatherData.forecasts.push({
                key: dayForecastKey,
                isoString: dayISOString,
                next6h: findAndExtractValues(timeseries, dayForecastKey, API_DURATIONS.NEXT_6_H, [API_KEYS.AIR_TEMP_MAX, API_KEYS.AIR_TEMP_MIN, API_KEYS.SYMBOL_CODE]),
                next12h: findAndExtractValues(timeseries, dayForecastKey, API_DURATIONS.NEXT_12_H, [API_KEYS.SYMBOL_CODE]),
            });
        }

        // --- Update DOM ---
        renderWeather(weatherData);

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
