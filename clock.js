// --- Imports ---
import { APP_CONFIG } from './config.js';
import {
    addZero,
    getLocalDateString,
    fetchWithRetry,
    MS_IN_SECOND
} from './utils.js';

// --- Configuration ---
const COMMON_IMAGE_PATH = APP_CONFIG.WEATHER?.COMMON_IMAGE_PATH || './images/common/';
const CLOCK_CONFIG = APP_CONFIG.CLOCK || {};
const LOCATION_CONFIG = APP_CONFIG.LOCATION || { LATITUDE: 0, LONGITUDE: 0 };

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

        this.#createContentStructure(container);

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
        this.#displaySkeletonLoader();

        // Run startup diagnostics to detect missing upstream scripts or globals.
        const missing = [];
        const requiredGlobals = {
            'SunCalc': typeof SunCalc !== 'undefined',
            'drawPlanetPhase': typeof drawPlanetPhase !== 'undefined'
        };

        for (const [name, present] of Object.entries(requiredGlobals)) {
            if (!present) missing.push(name);
        }

        if (missing.length > 0) {
            const msg = `Initialization Error: Missing required globals/scripts: ${missing.join(', ')}.`;
            console.error(msg);
            // Provide actionable hint for debugging
            const hint = 'Ensure `suncalc`/`moon.js` loaded successfully.';
            this.#showError(`${msg} ${hint}`);
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

        try {
            // These will now run regardless of the holiday fetch result.
            this.#updateClockDisplay(); // Start the main update loop
            this.#updateSunMoonInfo(); // Initial call to populate sun/moon data immediately
            this.#updateHolidayErrorIndicator(); // Show error indicator if needed
        } catch (error) {
            this.#showError(`Clock failed during initial display update: ${error.message}`);
            return; // Stop further execution
        } finally {
            this.#transitionFromSkeletonToContent();
            console.log("Clock initialized or failed gracefully. Skeleton removed.");
        }
    }

    #createContentStructure(container) {
        container.innerHTML = `
            <!-- Real Content (initially empty, populated by JS) -->
            <div id="day" class="day"></div>
            <div id="clock">
                <div id="time"></div>
                <div id="seconds"></div>
            </div>
            <div id="date"></div>
            <div id="sunmoon">
                <div id="moon"></div>
                <img id="sunriseicon" src="./images/common/sunrise.svg" alt="sunrise" />
                <div id="sunrisetime"></div>
                <img id="sunseticon" src="./images/common/sunset.svg" alt="sunset" />
                <div id="sunsettime"></div>
            </div>
        `;
    }

    #displaySkeletonLoader() {
        this.#elements.container.classList.add('content-hidden');

        const skeletonHTML = `
            <div class="skeleton-line" style="width: 220px; height: 35px; margin-bottom: 2px;"></div>
            <div class="skeleton-line" style="width: 300px; height: 90px;"></div>
            <div class="skeleton-line" style="width: 250px; height: 35px; margin-bottom: 15px;"></div>
            <div class="skeleton-box" style="width: 240px; height: 70px;"></div>
        `;

        const skeletonContainer = document.createElement('div');
        skeletonContainer.className = 'clock-skeleton';
        skeletonContainer.innerHTML = skeletonHTML;
        document.body.appendChild(skeletonContainer);
    }

    #showError(message) {
        console.error(message);
        this.#transitionFromSkeletonToContent(); // Hide skeleton, show error
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
            this.#updateSunMoonInfo(); // Sun/moon times only need to be updated once a day.
        }

        const seconds = addZero(now.getSeconds());

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

            // Use requestAnimationFrame to ensure dimensions are calculated after the DOM is painted.
            // This is more reliable and idiomatic than Promise.resolve().then().
            requestAnimationFrame(() => {
                // Check if the element is still in the DOM, in case of rapid updates.
                if (!textSpan.isConnected) return;

                if (textSpan.scrollWidth > dayEl.clientWidth) {
                    textSpan.classList.add('scrolling-text');
                    const scrollDistance = textSpan.scrollWidth + dayEl.clientWidth;
                    const scrollSpeed = 80; // pixels per second, could be moved to config
                    if (scrollSpeed > 0) {
                        textSpan.style.animationDuration = `${scrollDistance / scrollSpeed}s`;
                    }
                }
            });
        } else {
            dayEl.textContent = dayName;
        }
    }

    #transitionFromSkeletonToContent() {
        const skeletonContainer = document.querySelector('.clock-skeleton');

        // Fade the main content IN
        this.#elements.container.classList.remove('content-hidden');

        if (skeletonContainer) {
            skeletonContainer.classList.add('skeleton-hidden');
            skeletonContainer.addEventListener('transitionend', () => skeletonContainer.remove());
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
    const skeleton = document.querySelector('.clock-skeleton');
    if (skeleton) skeleton.remove();
}

// Failsafe: if for any reason scripts fail to run or initialization hangs,
// remove the skeleton after a timeout so the UI doesn't remain blocked forever.
setTimeout(() => {
    const skeleton = document.querySelector('.clock-skeleton');
    if (skeleton) {
        console.warn('Clock skeleton timeout reached — removing skeleton to avoid infinite loader.');
        skeleton.remove();

        const container = document.getElementById('timedate');
        if (container && !container.querySelector('.clock-error-state') && !container.querySelector('.clock-failsafe')) {
            const msg = document.createElement('div');
            msg.className = 'clock-failsafe';
            msg.textContent = 'Initialization timed out — showing best-effort clock. See console for details.';
            container.insertBefore(msg, container.firstChild);
            container.classList.remove('content-hidden'); // Make sure the container is visible
        }
    }
}, 10000);
