// --- Configuration ---
// Configuration is now loaded from config.js via the global APP_CONFIG object.
const API_URL = APP_CONFIG.WEATHER.API_URL;
const LATITUDE = APP_CONFIG.LOCATION.LATITUDE;
const LONGITUDE = APP_CONFIG.LOCATION.LONGITUDE;
const THEME = APP_CONFIG.WEATHER.THEME;
const NUM_OF_DAYS_FORECAST = APP_CONFIG.WEATHER.NUM_OF_DAYS_FORECAST;
const WEATHER_CONTAINER_SELECTOR = APP_CONFIG.WEATHER.CONTAINER_SELECTOR;
const TIME_BLOCK_LABELS = APP_CONFIG.WEATHER.TIME_BLOCK_LABELS;
const MONTH_NAMES = APP_CONFIG.WEATHER.MONTH_NAMES;

// --- Constants ---
// Get theme-specific settings from config, with a fallback for safety.
const IMAGE_EXT = APP_CONFIG.WEATHER.THEME_SETTINGS[THEME]?.extension || '.svg';
const IMAGE_PATH = `./images/${THEME}/`;
const MS_IN_DAY = 86400000;

// --- Constants for Retry ---
const MAX_FETCH_RETRIES = APP_CONFIG.WEATHER.MAX_FETCH_RETRIES;
const RETRY_DELAY_MS = APP_CONFIG.WEATHER.RETRY_DELAY_MS;
const REFRESH_INTERVAL_MIN = APP_CONFIG.WEATHER.REFRESH_INTERVAL_MIN;

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

/**
 * Determines the upcoming 6-hour forecast block based on the current time.
 * @param {Date} now - The current date and time.
 * @returns {{labelKey: string, forecastHour: number, isNextDay: boolean}}
 */
const getUpcomingTimeBlock = (now) => {
    const currentHour = now.getHours();
    if (currentHour < 6) {
        return { labelKey: 'MORNING', forecastHour: 6, isNextDay: false };
    }
    if (currentHour < 12) {
        return { labelKey: 'AFTERNOON', forecastHour: 12, isNextDay: false };
    }
    if (currentHour < 18) {
        return { labelKey: 'EVENING', forecastHour: 18, isNextDay: false };
    }
    // After 6 PM, the next block is "Night" which starts at midnight of the next day.
    return { labelKey: 'NIGHT', forecastHour: 0, isNextDay: true };
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
        const monthIndex = date.getMonth(); // 0-11
        const monthName = MONTH_NAMES[monthIndex];

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
 * Calculates the min and max temperature for a full day from the timeseries data.
 * @param {object[]} timeseries - The array of timeseries data from the API.
 * @param {Date} targetDate - The date for which to calculate the min/max.
 * @returns {{min: number | null, max: number | null}} An object with the min and max temperatures.
 */
const calculateDailyMinMax = (timeseries, targetDate) => {
    const dayKey = getLocalDateString(targetDate); // "YYYY-MM-DD"
    let dailyMin = null;
    let dailyMax = null;

    // Filter for timeseries entries for the target day that have a next_6_hours forecast
    const relevantForecasts = timeseries.filter(entry =>
        entry.time.startsWith(dayKey) && entry.data?.next_6_hours?.details
    );

    for (const entry of relevantForecasts) {
        const { air_temperature_min, air_temperature_max } = entry.data.next_6_hours.details;

        if (air_temperature_max !== undefined) {
            if (dailyMax === null || air_temperature_max > dailyMax) {
                dailyMax = air_temperature_max;
            }
        }
        if (air_temperature_min !== undefined) {
            if (dailyMin === null || air_temperature_min < dailyMin) {
                dailyMin = air_temperature_min;
            }
        }
    }
    return { min: dailyMin, max: dailyMax };
};

/**
 * Formats temperature value into HTML with integer and decimal parts.
 * @param {number | undefined} temp - The temperature value.
 * @returns {string} HTML string for temperature display.
 */
const formatTemperatureHTML = (temp) => {
    if (temp == null) return "<div class='temp'>--&deg;</div>"; // Handle missing temp with == null

    const tempString = String(Math.abs(temp)); // Use Math.abs to handle negative sign separately
    const [integerPart, decimalPart] = tempString.split('.');

    // Using a simpler flexbox layout for the temperature parts.
    return `<div class='temp'>
                <span class='t1'>${temp < 0 ? '-' : ''}${integerPart}</span>
                <div class='t-right-stack'><span class='deg'>&deg;</span><span class='t2'>.${decimalPart ?? '0'}</span></div>
            </div>`;
};

/**
 * Generates HTML for the current weather conditions.
 * @param {object} instantData - Data for 'instant'.
 * @param {object} next1hData - Data for 'next_1_hours'.
 * @param {Date} currentTime - Current time.
 * @param {number|null} feelsLikeTemp - The calculated "feels like" temperature.
 * @returns {string} HTML string.
 */
const createCurrentWeatherHTML = (instantData, next1hData, currentTime, feelsLikeTemp) => {
    const temp = instantData?.air_temperature;
    const windSpeed = instantData?.wind_speed;

    const symbolCode = next1hData?.symbol_code || 'default'; // Use API symbol directly
    const precipitationProb = next1hData?.probability_of_precipitation;

    const conditionImage = `<img class='conditionpic' src='${IMAGE_PATH}${symbolCode}${IMAGE_EXT}' alt='${symbolCode}' />`;
    const mainTemperatureHTML = formatTemperatureHTML(temp);

    // Create the "feels like" display with an icon, for placement under the main temp.
    const feelsLikeHTML = (feelsLikeTemp !== null)
        ? `<div class="feels-like-temp"><img src="${APP_CONFIG.WEATHER.FEELS_LIKE_ICON_PATH}" alt="feels like" class="feels-like-icon" /><span>${feelsLikeTemp}&deg;</span></div>`
        : "";

    let windIcon = 'wind';
    // Use specific wind icons only if wind speed is defined and within range 0-12
    if (windSpeed !== undefined && windSpeed >= 0 && windSpeed < 13) {
        windIcon = `wind-${Math.floor(windSpeed)}`; // Use integer part for icon name
    }
    // Wrap icon and text in a container for consistent alignment
    const windHTML = `<div class="item"><img class='icon image1' src='${APP_CONFIG.WEATHER.COMMON_IMAGE_PATH}${windIcon}.svg' alt='wind' /><div>${Math.round(windSpeed) ?? '--'}<sup>m/s</sup></div></div>`;

    const thunderIcon = (symbolCode.includes("thunder"))
        ? `<img class='icon image2' src='${APP_CONFIG.WEATHER.COMMON_IMAGE_PATH}thunder.svg' alt='thunder' />`
        : "";
    // Wrap icon and text in a container for consistent alignment
    const precipitationHTML = `<div class="item"><div class='parent'><img class='icon' src='${APP_CONFIG.WEATHER.COMMON_IMAGE_PATH}umbrella.svg' alt='umbrella' />${thunderIcon}</div><div>${precipitationProb ?? '--'}<sup>%</sup></div></div>`;

    // Create a new container to hold both the main temperature and the "feels like" temp
    const temperatureBlockHTML = `<div class="temperature-block">
                                    ${mainTemperatureHTML}
                                    ${feelsLikeHTML}
                                  </div>`;

    return `<div class='daycontainer'>
                <div class='item propscontainer'>
                    ${windHTML}
                    ${precipitationHTML}
                </div>
                ${conditionImage}
                ${temperatureBlockHTML}
            </div>`;
};

/**
 * Generates HTML for a single forecast day (today or future).
 * @param {object} dayData - The processed data for the forecast day.
 * @param {Date} currentTime - Current time (used for today's forecast).
 * @param {object} sunTimes - Sunrise/sunset times.
 * @param {boolean} isTodaySummary - Flag if this is the summary part for today.
 * @returns {string} HTML string.
 */
const createForecastDayHTML = (dayData, currentTime, sunTimes, isTodaySummary = false) => {
    const { isoString, minTemp, maxTemp, timeBlockLabel } = dayData;
    let { symbolCode } = dayData;

    // Adjust symbol: Use daytime for future days, adjust based on current time for today's summary
    if (symbolCode) {
        // For future day summaries, always prefer the daytime icon for consistency.
        if (!isTodaySummary) {
            symbolCode = symbolCode.replace('_night', '_day');
        }
    } else {
        symbolCode = 'default'; // Fallback symbol
    }

    // For the "Today" summary, use the time block label (e.g., "ÕHTU"). For future days, use the date.
    const timeClass = isTodaySummary ? 'item time time-today-label' : 'item time';
    const timeHTML = (isTodaySummary && timeBlockLabel)
        ? `<div class='${timeClass}'>${timeBlockLabel}</div>`
        : `<div class='${timeClass}'>${formatDateEstonian(isoString)}</div>`;
    const conditionImage = `<img class='conditionpic' src='${IMAGE_PATH}${symbolCode}${IMAGE_EXT}' alt='${symbolCode}' />`;
    const maxTempHTML = `<div class='item tempmax'><span>${maxTemp !== null ? Math.round(maxTemp) : '--'}&deg;</span></div>`;
    const minTempHTML = `<div class='item tempmin'><span>${minTemp !== null ? Math.round(minTemp) : '--'}&deg;</span></div>`;

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

    const skeletons = [createSkeletonItemHTML(true)]; // Start with current weather
    // +1 for today's summary forecast
    for (let i = 0; i < NUM_OF_DAYS_FORECAST + 1; i++) {
        skeletons.push(createSkeletonItemHTML(false));
    }

    // The CSS in weather.css uses a `.weather-skeleton` class on the container
    // to apply the pulsing animation to children.
    weatherContainer.classList.add('weather-skeleton');
    weatherContainer.innerHTML = skeletons.join('');
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

    const { current, todaySummary, forecasts, sunTimes, now, feelsLike } = weatherData;

    // Create HTML for current conditions
    const currentWeatherHTML = createCurrentWeatherHTML(current.instant, current.next1h, now, feelsLike);

    // Create HTML for today's forecast summary
    let todaySummaryHTML = "";
    if (todaySummary.isoString) {
        todaySummaryHTML = createForecastDayHTML(todaySummary, now, sunTimes, true);
    } else {
        console.warn("Could not get 6-hour forecast data for today's summary.");
    }

    // Create HTML for future days
    const futureForecastHTML = forecasts.map(day => {
        if (day.isoString) {
            return createForecastDayHTML(day, now, sunTimes);
        }
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
const fetchAndDisplayWeather = async () => {
    const now = new Date();
    const apiUrl = `${API_URL}?lat=${LATITUDE}&lon=${LONGITUDE}`;

    displaySkeletonLoader();
    console.log(`Fetching weather data from ${apiUrl}`);

    try {
        const data = await fetchWithRetry(apiUrl, {
            maxRetries: MAX_FETCH_RETRIES,
            retryDelay: RETRY_DELAY_MS,
            onRetry: (attempt, maxRetries) => {
                // This function is called before a retry happens.
                // It's a great place to update the UI.
                const nextAttempt = attempt + 1;
                updateStatus(`Failed to load weather. Retrying in ${RETRY_DELAY_MS / 1000}s... (Attempt ${nextAttempt}/${maxRetries})`, true);
            }
        });

        if (!data?.properties?.timeseries) {
            throw new Error("Invalid API response structure.");
        }
        const timeseries = data.properties.timeseries;

        // Create a Map for efficient O(1) lookups of timeseries data.
        // The key is the full ISO timestamp (e.g., "2024-02-03T06:00:00Z").
        const timeMap = new Map(timeseries.map(entry => [entry.time, entry]));

        // --- Get Sun Times ---
        const sunTimes = SunCalc.getTimes(now, LATITUDE, LONGITUDE);
        console.log(`Sunrise: ${sunTimes.sunrise}, Sunset: ${sunTimes.sunset}`);

        // --- Process Current & Today's Weather ---
        // The first entry in the timeseries is always the most current forecast.
        const mostRecentForecast = timeseries[0];
        const todayTemps = calculateDailyMinMax(timeseries, now);

        // --- Process "Today" Summary (Upcoming Time Block) ---
        const upcomingBlock = getUpcomingTimeBlock(now);
        const daysOffset = upcomingBlock.isNextDay ? 1 : 0;
        const upcomingBlockKey = getFutureDateString(now, daysOffset, upcomingBlock.forecastHour);
        const upcomingBlockEntry = timeMap.get(`${upcomingBlockKey}:00:00Z`);
        const upcomingBlockSymbol = extractValues(upcomingBlockEntry, API_DURATIONS.NEXT_6_H, [API_KEYS.SYMBOL_CODE])?.symbol_code;

        const currentTemp = extractValues(mostRecentForecast, API_DURATIONS.INSTANT, [API_KEYS.AIR_TEMP])?.air_temperature;
        const currentWind = extractValues(mostRecentForecast, API_DURATIONS.INSTANT, [API_KEYS.WIND_SPEED])?.wind_speed;
        // --- FOR TESTING "FEELS LIKE" ---
        // Comment out the original lines and use these test values.
        // const currentTemp = extractValues(mostRecentForecast, API_DURATIONS.INSTANT, [API_KEYS.AIR_TEMP])?.air_temperature;
        // const currentWind = extractValues(mostRecentForecast, API_DURATIONS.INSTANT, [API_KEYS.WIND_SPEED])?.wind_speed;
        //const currentTemp = -5; // Test value: Must be 10 or less.
        //const currentWind = 8;  // Test value: Must be > 1.34 m/s.
        // --- END TESTING ---
        const weatherData = {
            now,
            sunTimes,
            feelsLike: calculateWindChill(currentTemp, currentWind),
            current: {
                instant: extractValues(mostRecentForecast, API_DURATIONS.INSTANT, [API_KEYS.AIR_TEMP, API_KEYS.WIND_SPEED]),
                next1h: extractValues(mostRecentForecast, API_DURATIONS.NEXT_1_H, [API_KEYS.SYMBOL_CODE, API_KEYS.PRECIP_PROB]),
            },
            todaySummary: {
                isoString: `${upcomingBlockKey}:00:00Z`, // ISO string for the upcoming block
                timeBlockLabel: TIME_BLOCK_LABELS[upcomingBlock.labelKey] || upcomingBlock.labelKey,
                minTemp: todayTemps.min,
                maxTemp: todayTemps.max,
                symbolCode: upcomingBlockSymbol,
            },
            forecasts: []
        };

        // --- Process Future Days ---
        for (let j = 1; j <= NUM_OF_DAYS_FORECAST; j++) {
            const futureDate = new Date(now);
            futureDate.setDate(now.getDate() + j);
            const futureTemps = calculateDailyMinMax(timeseries, futureDate);
            const middayKey = `${getFutureDateString(futureDate, 0, 12)}:00:00Z`; // Use midday for date formatting and icon

            const middayEntry = timeMap.get(middayKey);
            const middaySymbol = extractValues(middayEntry, API_DURATIONS.NEXT_12_H, [API_KEYS.SYMBOL_CODE])?.symbol_code;

            weatherData.forecasts.push({
                isoString: middayKey,
                minTemp: futureTemps.min,
                maxTemp: futureTemps.max,
                symbolCode: middaySymbol,
            });
        }

        // --- Update DOM ---
        renderWeather(weatherData);

    } catch (error) {
        console.error("All retries failed for weather data.", error);
        updateStatus(`ERROR: ${error.message}`, true);
    }
};

// --- Initial Load ---
// Ensure SunCalc is loaded before running
if (typeof SunCalc !== 'undefined') {
    fetchAndDisplayWeather(); // Initial call, will use default currentAttempt = 1
    // The new fetchAndDisplayWeather is self-contained and can be called by setInterval.
    setInterval(fetchAndDisplayWeather, REFRESH_INTERVAL_MIN * MS_IN_MINUTE); // Use configurable refresh interval
} else {
    updateStatus("Error: SunCalc library not loaded.", true);
}
