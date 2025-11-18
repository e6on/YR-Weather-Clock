// --- Configuration & Constants ---
// Configuration is now loaded from config.js via the global APP_CONFIG object.
const COMMON_IMAGE_PATH = APP_CONFIG.WEATHER.COMMON_IMAGE_PATH;
const CLOCK_CONFIG = APP_CONFIG.CLOCK;
const LOCATION_CONFIG = APP_CONFIG.LOCATION;

class ClockWidget {
    // Private fields for state and DOM elements
    #elements = {};
    #currentHolidayEvent = "";
    #lastCheckedDateForHoliday = "";
    #lastDisplayedEventMessage = null;
    #holidayFetchFailed = false;

    constructor(containerSelector) {
        const container = document.querySelector(containerSelector);
        if (!container) {
            throw new Error(`Clock container with selector "${containerSelector}" not found.`);
        }

        // Cache all required elements within the container
        this.#elements = {
            container: container,
            day: document.getElementById('day'),
            date: document.getElementById('date'),
            time: document.getElementById('time'),
            seconds: document.getElementById('seconds'),
            moon: document.getElementById('moon'),
            sunriseTime: document.getElementById('sunrisetime'),
            sunsetTime: document.getElementById('sunsettime'),
        };

        // Validate that all elements were found
        const missingElements = Object.keys(this.#elements).filter(key => !this.#elements[key]);
        if (missingElements.length > 0) {
            const missingIds = missingElements.map(key => `#${this.#elements[key]?.id || key}`).join(', ');
            throw new Error(`Initialization failed: Missing essential elements: ${missingIds}`);
        }
        console.log("ClockWidget constructor: All required DOM elements found.");
    }

    async init() {
        console.log("Initializing clock...");

        if (typeof SunCalc === 'undefined' || typeof drawPlanetPhase === 'undefined') {
            this.#showError("Initialization Error: Required libraries (SunCalc, drawPlanetPhase) not loaded.");
            return;
        }

        // Isolate the holiday fetch so it doesn't block initialization on failure.
        try {
            const currentDate = getLocalDateString(new Date());
            this.#lastCheckedDateForHoliday = currentDate;
            await this.#fetchAndSetHoliday(currentDate);
            console.log("Initial holiday/event check complete.");
        } catch (error) {
            // If fetching holidays fails, log it, set the error state, and continue.
            console.error("Non-critical error: Failed to fetch initial holiday data. The clock will proceed without it.", error);
            this.#holidayFetchFailed = true;
        }

        // These will now run regardless of the holiday fetch result.
        this.#updateClockDisplay(); // Start the main update loop
        this.#updateSunMoonInfo(); // Initial call to populate sun/moon data immediately
        this.#updateHolidayErrorIndicator(); // Show error indicator if needed
        this.#elements.container.classList.remove('clock-skeleton');
        console.log("Clock initialized.");
    }

    #showError(message) {
        console.error(message);
        this.#elements.container.classList.remove('clock-skeleton');
        this.#elements.container.innerHTML = `<div class="clock-error-state">${message}</div>`;
    }

    async #fetchAndSetHoliday(dateStr) {
        const currentMonthDay = dateStr.substring(5);
        const currentYear = new Date(dateStr).getFullYear();
        const specialEvent = CLOCK_CONFIG.SPECIAL_EVENTS.find(event => event.date.substring(5) === currentMonthDay);

        if (specialEvent) {
            const eventYear = new Date(specialEvent.date).getFullYear();
            const anniversary = currentYear - eventYear;
            let eventMessage = specialEvent.message;
            const format = specialEvent.anniversaryFormat !== undefined ? specialEvent.anniversaryFormat : CLOCK_CONFIG.ANNIVERSARY_FORMAT;

            if (anniversary > 0 && format) {
                eventMessage += ` ${format.replace('{years}', anniversary)}`;
            }
            this.#currentHolidayEvent = eventMessage;
            console.log(`Special event found: ${this.#currentHolidayEvent}`);
            return;
        }

        const apiUrl = `${CLOCK_CONFIG.CORS_PROXY_URL}${CLOCK_CONFIG.HOLIDAY_API_URL}`;
        console.log(`Fetching public holidays from ${apiUrl}`);
        try {
            const holidays = await fetchWithRetry(apiUrl);
            if (!Array.isArray(holidays)) throw new Error("Invalid holiday data format.");

            const holiday = holidays.find(h => h.date === dateStr);
            this.#currentHolidayEvent = holiday ? holiday.title : "";
            console.log(this.#currentHolidayEvent ? `Holiday found: ${this.#currentHolidayEvent}` : `No public holiday for ${dateStr}.`);
        } catch (error) {
            console.error("Failed to fetch or process holidays:", error);
            this.#currentHolidayEvent = ""; // Reset on error
            throw error; // Re-throw the error to be caught by the init() method
        }
    }

    #updateSunMoonInfo() {
        const now = new Date();
        try {
            const moon = SunCalc.getMoonIllumination(now);
            const isWaxing = moon.angle < 0;
            console.log(`Moon: fraction=${moon.fraction.toFixed(3)}, phase=${moon.phase.toFixed(3)}, waxing=${isWaxing}`);
            this.#elements.moon.innerHTML = "";
            drawPlanetPhase(this.#elements.moon, moon.fraction, isWaxing, {
                diameter: CLOCK_CONFIG.MOON_DIAMETER,
                earthshine: 0,
                blur: 0,
                lightColour: '#212121',
                shadowColour: '#212121'
            });
        } catch (error) {
            console.error("Error updating moon phase:", error);
        }

        try {
            const sunTimes = SunCalc.getTimes(now, LOCATION_CONFIG.LATITUDE, LOCATION_CONFIG.LONGITUDE);
            const sunriseStr = `${addZero(sunTimes.sunrise.getHours())}:${addZero(sunTimes.sunrise.getMinutes())}`;
            const sunsetStr = `${addZero(sunTimes.sunset.getHours())}:${addZero(sunTimes.sunset.getMinutes())}`;
            this.#elements.sunriseTime.textContent = sunriseStr;
            this.#elements.sunsetTime.textContent = sunsetStr;
        } catch (error) {
            console.error("Error updating sun times:", error);
        }
    }

    async #updateClockDisplay() {
        const now = new Date();
        const currentDate = getLocalDateString(now);

        if (currentDate !== this.#lastCheckedDateForHoliday) {
            console.log(`Date changed to ${currentDate}. Fetching holiday info.`);
            this.#lastCheckedDateForHoliday = currentDate;
            try {
                await this.#fetchAndSetHoliday(currentDate);
                this.#holidayFetchFailed = false; // Success, so clear the flag.
            } catch (error) {
                // A non-critical error, but we should flag it.
                console.error("Failed to refresh holiday data for new day.", error);
                this.#holidayFetchFailed = true;
            }
            this.#updateHolidayErrorIndicator();
        }

        const seconds = addZero(now.getSeconds());
        if (seconds === '00') {
            console.log("Minute changed, updating sun/moon info.");
            this.#updateSunMoonInfo();
        }

        this.#elements.time.textContent = `${addZero(now.getHours())}:${addZero(now.getMinutes())}`;
        this.#elements.seconds.textContent = seconds;
        this.#elements.date.textContent = `${addZero(now.getDate())}.${addZero(now.getMonth() + 1)}.${now.getFullYear()}`;

        this.#updateDayOrEventDisplay(now);

        const msUntilNextSecond = MS_IN_SECOND - now.getMilliseconds();
        setTimeout(() => this.#updateClockDisplay(), msUntilNextSecond > 0 ? msUntilNextSecond : MS_IN_SECOND);
    }

    #updateHolidayErrorIndicator() {
        if (this.#holidayFetchFailed) {
            this.#elements.day.classList.add('holiday-fetch-failed');
        } else {
            this.#elements.day.classList.remove('holiday-fetch-failed');
        }
    }

    #updateDayOrEventDisplay(now) {
        const dayName = now.toLocaleDateString('et-EE', { weekday: 'long' });
        const messageToDisplay = this.#currentHolidayEvent || dayName;

        if (messageToDisplay === this.#lastDisplayedEventMessage) {
            return; // No change, do nothing
        }

        console.log(`Display message changed from "${this.#lastDisplayedEventMessage}" to "${messageToDisplay}"`);
        this.#lastDisplayedEventMessage = messageToDisplay;
        const dayEl = this.#elements.day;
        dayEl.innerHTML = '';
        dayEl.className = 'day';

        if (this.#currentHolidayEvent) {
            dayEl.classList.add("cal_event");
            const textSpan = document.createElement('span');
            textSpan.innerHTML = this.#currentHolidayEvent;
            dayEl.appendChild(textSpan);

            Promise.resolve().then(() => {
                if (textSpan.scrollWidth > dayEl.clientWidth) {
                    textSpan.classList.add('scrolling-text');
                    const scrollDistance = textSpan.scrollWidth + dayEl.clientWidth;
                    const scrollSpeed = 80; // pixels per second
                    textSpan.style.animationDuration = `${scrollDistance / scrollSpeed}s`;
                }
            });
        } else {
            dayEl.textContent = dayName;
        }
    }
}

// --- Initialization ---
try {
    console.log("Attempting to create and initialize ClockWidget...");
    const clockWidget = new ClockWidget('#timedate');
    clockWidget.init();
} catch (error) {
    console.error("Failed to initialize ClockWidget:", error.message);
    // Display a critical error if the widget couldn't even be created.
    const container = document.getElementById('timedate') || document.body;
    container.innerHTML = `<div class="clock-error-state">${error.message}</div>`;
    container.classList.remove('clock-skeleton');
}
