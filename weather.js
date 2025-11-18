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
// --- Main Weather Fetching and Display Logic ---
class WeatherWidget {
    #container;

    constructor(selector) {
        this.#container = document.querySelector(selector);
        if (!this.#container) {
            throw new Error(`Weather container with selector "${selector}" not found.`);
        }
        console.log("WeatherWidget constructor: All required DOM elements found.");
    }

    /**
     * Initializes the widget, fetches data, and sets up the refresh interval.
     */
    init() {
        if (typeof SunCalc === 'undefined') {
            this.#updateStatus("Initialization Error: SunCalc library not loaded.", true);
            return;
        }
        console.log("Initializing WeatherWidget...");

        this.fetchAndDisplayWeather(); // Initial fetch
        setInterval(() => this.fetchAndDisplayWeather(), REFRESH_INTERVAL_MIN * MS_IN_MINUTE);
        console.log(`Weather data refresh interval set to ${REFRESH_INTERVAL_MIN} minutes.`);
    }

    // --- Private Helper Methods ---

    #getUpcomingTimeBlock(now) {
        const currentHour = now.getHours();
        if (currentHour < 6) return { labelKey: 'MORNING', forecastHour: 6, isNextDay: false };
        if (currentHour < 12) return { labelKey: 'AFTERNOON', forecastHour: 12, isNextDay: false };
        if (currentHour < 18) return { labelKey: 'EVENING', forecastHour: 18, isNextDay: false };
        return { labelKey: 'NIGHT', forecastHour: 0, isNextDay: true };
    }

    #formatDateEstonian(isoString) {
        try {
            const date = new Date(isoString);
            const dayInitial = date.toLocaleDateString('et-EE', { weekday: 'short' }).charAt(0).toUpperCase();
            const dayOfMonth = date.getDate();
            const monthIndex = date.getMonth();
            const monthName = MONTH_NAMES[monthIndex];
            return `&nbsp;<span>${dayInitial}</span>&nbsp;&nbsp;${dayOfMonth}&nbsp;${monthName}`;
        } catch (e) {
            console.error("Error formatting date:", isoString, e);
            return "Invalid Date";
        }
    }

    #extractValues(timeData, duration, keys) {
        const results = {};
        const dataBlock = timeData?.data?.[duration];
        if (!dataBlock) return results;

        for (const key of keys) {
            if (dataBlock.summary && Object.hasOwn(dataBlock.summary, key)) {
                results[key] = dataBlock.summary[key];
            } else if (dataBlock.details && Object.hasOwn(dataBlock.details, key)) {
                results[key] = dataBlock.details[key];
            }
        }
        return results;
    }

    #calculateDailyMinMax(timeseries, targetDate) {
        const dayKey = getLocalDateString(targetDate);
        let dailyMin = null;
        let dailyMax = null;

        const relevantForecasts = timeseries.filter(entry =>
            entry.time.startsWith(dayKey) && entry.data?.next_6_hours?.details
        );

        for (const entry of relevantForecasts) {
            const { air_temperature_min, air_temperature_max } = entry.data.next_6_hours.details;
            if (air_temperature_max !== undefined && (dailyMax === null || air_temperature_max > dailyMax)) {
                dailyMax = air_temperature_max;
            }
            if (air_temperature_min !== undefined && (dailyMin === null || air_temperature_min < dailyMin)) {
                dailyMin = air_temperature_min;
            }
        }
        return { min: dailyMin, max: dailyMax };
    }

    #formatTemperatureHTML(temp) {
        if (temp == null) return "<div class='temp'>--&deg;</div>";
        const tempString = String(Math.abs(temp));
        const [integerPart, decimalPart] = tempString.split('.');
        return `<div class='temp'>
                    <span class='t1'>${temp < 0 ? '-' : ''}${integerPart}</span>
                    <div class='t-right-stack'><span class='deg'>&deg;</span><span class='t2'>.${decimalPart ?? '0'}</span></div>
                </div>`;
    }

    // --- HTML Generation Methods ---

    #createCurrentWeatherHTML(instantData, next1hData, feelsLikeTemp) {
        const temp = instantData?.air_temperature;
        const windSpeed = instantData?.wind_speed;
        const symbolCode = next1hData?.symbol_code || 'default';
        const precipitationProb = next1hData?.probability_of_precipitation;

        const conditionImage = `<img class='conditionpic' src='${IMAGE_PATH}${symbolCode}${IMAGE_EXT}' alt='${symbolCode}' />`;
        const mainTemperatureHTML = this.#formatTemperatureHTML(temp);

        const feelsLikeHTML = (feelsLikeTemp !== null)
            ? `<div class="feels-like-temp"><img src="${APP_CONFIG.WEATHER.FEELS_LIKE_ICON_PATH}" alt="feels like" class="feels-like-icon" /><span>${feelsLikeTemp}&deg;</span></div>`
            : "";

        let windIcon = 'wind';
        if (windSpeed !== undefined && windSpeed >= 0 && windSpeed < 13) {
            windIcon = `wind-${Math.floor(windSpeed)}`;
        }
        const windHTML = `<div class="item"><img class='icon image1' src='${APP_CONFIG.WEATHER.COMMON_IMAGE_PATH}${windIcon}.svg' alt='wind' /><div>${Math.round(windSpeed) ?? '--'}<sup>m/s</sup></div></div>`;

        const thunderIcon = (symbolCode.includes("thunder"))
            ? `<img class='icon image2' src='${APP_CONFIG.WEATHER.COMMON_IMAGE_PATH}thunder.svg' alt='thunder' />`
            : "";
        const precipitationHTML = `<div class="item"><div class='parent'><img class='icon' src='${APP_CONFIG.WEATHER.COMMON_IMAGE_PATH}umbrella.svg' alt='umbrella' />${thunderIcon}</div><div>${precipitationProb ?? '--'}<sup>%</sup></div></div>`;

        const temperatureBlockHTML = `<div class="temperature-block">${mainTemperatureHTML}${feelsLikeHTML}</div>`;

        return `<div class='daycontainer'>
                    <div class='item propscontainer'>${windHTML}${precipitationHTML}</div>
                    ${conditionImage}
                    ${temperatureBlockHTML}
                </div>`;
    }

    #createForecastDayHTML(dayData, isTodaySummary = false) {
        const { isoString, minTemp, maxTemp, timeBlockLabel } = dayData;
        let { symbolCode } = dayData;

        if (symbolCode) {
            if (!isTodaySummary) symbolCode = symbolCode.replace('_night', '_day');
        } else {
            symbolCode = 'default';
        }

        const timeClass = isTodaySummary ? 'item time time-today-label' : 'item time';
        const timeHTML = (isTodaySummary && timeBlockLabel)
            ? `<div class='${timeClass}'>${timeBlockLabel}</div>`
            : `<div class='${timeClass}'>${this.#formatDateEstonian(isoString)}</div>`;

        const conditionImage = `<img class='conditionpic' src='${IMAGE_PATH}${symbolCode}${IMAGE_EXT}' alt='${symbolCode}' />`;
        const maxTempHTML = `<div class='item tempmax'><span>${maxTemp !== null ? Math.round(maxTemp) : '--'}&deg;</span></div>`;
        const minTempHTML = `<div class='item tempmin'><span>${minTemp !== null ? Math.round(minTemp) : '--'}&deg;</span></div>`;

        return `<div class='daycontainer'>${timeHTML}${conditionImage}${maxTempHTML}${minTempHTML}</div>`;
    }

    #createSkeletonItemHTML(isCurrent) {
        if (isCurrent) {
            return `<div class="daycontainer skeleton-item skeleton-item-current">
                        <div class="item propscontainer skeleton-head"><div class="skeleton-line" style="width: 170px; height: 1em; margin-bottom: 5px;"></div></div>
                        <div class="skeleton-box skeleton-condimage"></div>
                        <div class="skeleton-box skeleton-temp-large"></div>
                    </div>`;
        }
        return `<div class="daycontainer skeleton-item skeleton-item-forecast">
                    <div class="item time skeleton-head skeleton-time skeleton-line"></div>
                    <div class="skeleton-box skeleton-condimage"></div>
                    <div class="skeleton-line skeleton-tmax"></div>
                    <div class="skeleton-line skeleton-tmin"></div>
                </div>`;
    }

    // --- UI Update Methods ---

    #displaySkeletonLoader() {
        // Make sure the main container is hidden initially
        this.#container.classList.add('content-hidden');

        // Create the skeleton items
        const skeletons = [this.#createSkeletonItemHTML(true)];
        for (let i = 0; i < NUM_OF_DAYS_FORECAST + 1; i++) {
            skeletons.push(this.#createSkeletonItemHTML(false));
        }

        // Create a dedicated skeleton container and add it to the body
        const skeletonContainer = document.createElement('div');
        skeletonContainer.className = 'weather-skeleton';
        skeletonContainer.innerHTML = skeletons.join('');
        document.body.appendChild(skeletonContainer);
    }

    #updateStatus(message, isError = false) {
        console.log(isError ? "Error:" : "Status:", message);
        if (isError) {
            this.#container.classList.remove('weather-skeleton');
            this.#container.innerHTML = `<div style="text-align: center; padding: 20px;">${message}</div>`;
            this.#container.style.color = 'red';
        }
    }

    #renderWeather(weatherData) {
        const { current, todaySummary, forecasts, feelsLike } = weatherData;

        const currentWeatherHTML = this.#createCurrentWeatherHTML(current.instant, current.next1h, feelsLike);

        const todaySummaryHTML = todaySummary.isoString
            ? this.#createForecastDayHTML(todaySummary, true)
            : (console.warn("Could not get 6-hour forecast data for today's summary."), "");

        const futureForecastHTML = forecasts.map(day => {
            return day.isoString
                ? this.#createForecastDayHTML(day)
                : `<div class="daycontainer" style="align-items: center; justify-content: center; color: #777;"><div class='item time'>${this.#formatDateEstonian(day.isoString)}</div><div>No forecast</div></div>`;
        }).join('');

        // --- Animate the transition from skeleton to content ---

        // 1. Inject the real content into the (currently hidden) main container
        this.#container.innerHTML = currentWeatherHTML + todaySummaryHTML + futureForecastHTML;

        // 2. Find the skeleton overlay
        const skeletonContainer = document.querySelector('.weather-skeleton');

        // 3. Fade the main content IN
        this.#container.classList.remove('content-hidden');

        // 4. Fade the skeleton OUT
        if (skeletonContainer) {
            skeletonContainer.classList.add('skeleton-hidden');
            // 5. Remove the skeleton from the DOM after it has faded out
            skeletonContainer.addEventListener('transitionend', () => skeletonContainer.remove());
        }
        console.log("Weather DOM updated successfully with fade-in animation.");
    }

    // --- Main Fetch and Process Method ---

    async fetchAndDisplayWeather() {
        const now = new Date();
        const apiUrl = `${API_URL}?lat=${LATITUDE}&lon=${LONGITUDE}`;

        this.#displaySkeletonLoader();
        console.log(`Fetching weather data from ${apiUrl}`);

        try {
            const data = await fetchWithRetry(apiUrl, {
                maxRetries: MAX_FETCH_RETRIES,
                retryDelay: RETRY_DELAY_MS,
                onRetry: (attempt, maxRetries) => {
                    this.#updateStatus(`Failed to load weather. Retrying... (Attempt ${attempt + 1}/${maxRetries})`, true);
                }
            });

            if (!data?.properties?.timeseries) throw new Error("Invalid API response structure.");
            console.log("Successfully fetched and parsed weather data.");
            const timeseries = data.properties.timeseries;
            const timeMap = new Map(timeseries.map(entry => [entry.time, entry]));

            const mostRecentForecast = timeseries[0];
            const upcomingBlock = this.#getUpcomingTimeBlock(now);
            const daysOffset = upcomingBlock.isNextDay ? 1 : 0;
            const upcomingBlockKey = getFutureDateString(now, daysOffset, upcomingBlock.forecastHour);
            const upcomingBlockDate = new Date(now);
            upcomingBlockDate.setDate(now.getDate() + daysOffset);

            const currentTemp = this.#extractValues(mostRecentForecast, API_DURATIONS.INSTANT, [API_KEYS.AIR_TEMP])?.air_temperature;
            const currentWind = this.#extractValues(mostRecentForecast, API_DURATIONS.INSTANT, [API_KEYS.WIND_SPEED])?.wind_speed;

            const feelsLikeTemp = calculateWindChill(currentTemp, currentWind);
            console.log(`Processing data: Upcoming block is '${upcomingBlock.labelKey}'. Feels like temp: ${feelsLikeTemp === null ? 'N/A' : feelsLikeTemp + '°C'}.`);

            const weatherData = {
                feelsLike: feelsLikeTemp,
                current: {
                    instant: this.#extractValues(mostRecentForecast, API_DURATIONS.INSTANT, [API_KEYS.AIR_TEMP, API_KEYS.WIND_SPEED]),
                    next1h: this.#extractValues(mostRecentForecast, API_DURATIONS.NEXT_1_H, [API_KEYS.SYMBOL_CODE, API_KEYS.PRECIP_PROB]),
                },
                todaySummary: {
                    isoString: `${upcomingBlockKey}:00:00Z`,
                    timeBlockLabel: TIME_BLOCK_LABELS[upcomingBlock.labelKey] || upcomingBlock.labelKey,
                    minTemp: this.#calculateDailyMinMax(timeseries, upcomingBlockDate).min,
                    maxTemp: this.#calculateDailyMinMax(timeseries, upcomingBlockDate).max,
                    symbolCode: this.#extractValues(timeMap.get(`${upcomingBlockKey}:00:00Z`), API_DURATIONS.NEXT_6_H, [API_KEYS.SYMBOL_CODE])?.symbol_code,
                },
                forecasts: []
            };

            for (let j = 1; j <= NUM_OF_DAYS_FORECAST; j++) {
                const futureDate = new Date(now);
                futureDate.setDate(now.getDate() + j);
                const middayKey = `${getFutureDateString(futureDate, 0, 12)}:00:00Z`;

                weatherData.forecasts.push({
                    isoString: middayKey,
                    minTemp: this.#calculateDailyMinMax(timeseries, futureDate).min,
                    maxTemp: this.#calculateDailyMinMax(timeseries, futureDate).max,
                    symbolCode: this.#extractValues(timeMap.get(middayKey), API_DURATIONS.NEXT_12_H, [API_KEYS.SYMBOL_CODE])?.symbol_code,
                });
            }

            this.#renderWeather(weatherData); // FOR TESTING: Comment this out to see the skeleton indefinitely

        } catch (error) {
            console.error("All retries failed for weather data.", error);
            this.#updateStatus(`ERROR: ${error.message}`, true);
        }
    }
}

// --- Initial Load ---
try {
    console.log("Attempting to create and initialize WeatherWidget...");
    const weatherWidget = new WeatherWidget(WEATHER_CONTAINER_SELECTOR);
    weatherWidget.init();
} catch (error) {
    console.error("Failed to initialize WeatherWidget:", error.message);
    // Optionally display an error in a fallback element if the main container is missing.
    document.body.innerHTML = `<div style="color: red; text-align: center; padding: 20px;">${error.message}</div>`;
}
