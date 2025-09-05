// --- Configuration & Constants ---
// Configuration is now loaded from config.js via the global APP_CONFIG object.
const COMMON_IMAGE_PATH = APP_CONFIG.WEATHER.COMMON_IMAGE_PATH;
const CLOCK_CONFIG = APP_CONFIG.CLOCK;
const LOCATION_CONFIG = APP_CONFIG.LOCATION;

// --- State ---
let currentHolidayEvent = ""; // Stores the fetched holiday/event name
let lastCheckedDateForHoliday = ""; // Tracks the date for which holidays were last fetched
let lastDisplayedEventMessage = null; // Tracks the currently displayed message to avoid re-rendering

// --- DOM Element Caching ---
// Cache frequently accessed elements to avoid repeated lookups
const elements = {
    day: document.getElementById('day'),
    date: document.getElementById('date'),
    time: document.getElementById('time'),
    seconds: document.getElementById('seconds'),
    moon: document.getElementById('moon'),
    sunriseTime: document.getElementById('sunrisetime'), // Corrected typo
    sunsetTime: document.getElementById('sunsettime') // Corrected typo
};

// --- Core Functions ---

/**
 * Fetches Estonian public holidays and checks for special events for the given date, then updates the state.
 * @param {string} dateStr - The date in YYYY-MM-DD format.
 */
const fetchAndSetHoliday = async (dateStr) => {
    // 1. Check for custom special events first (they override public holidays)
    const currentMonthDay = dateStr.substring(5); // "YYYY-MM-DD" -> "MM-DD"
    const currentYear = new Date(dateStr).getFullYear();

    const specialEvent = CLOCK_CONFIG.SPECIAL_EVENTS.find(event => event.date.substring(5) === currentMonthDay);

    if (specialEvent) {
        const eventYear = new Date(specialEvent.date).getFullYear();
        const anniversary = currentYear - eventYear;

        let eventMessage = specialEvent.message;
        // Append anniversary text if it's a positive number and a format is provided.
        // Use the event-specific format, or fall back to the global format.
        const format = specialEvent.anniversaryFormat !== undefined ? specialEvent.anniversaryFormat : CLOCK_CONFIG.ANNIVERSARY_FORMAT;

        if (anniversary > 0 && format) {
            if (format) { // Only append if the format string is not null or empty.
                const anniversaryText = format.replace('{years}', anniversary);
                eventMessage = `${eventMessage} ${anniversaryText}`;
            }
        }
        currentHolidayEvent = eventMessage;
        console.log(`Special event found: ${currentHolidayEvent}`);
        return; // An event was found, no need to fetch public holidays
    }

    // 2. Fetch public holidays
    const apiUrl = `${CLOCK_CONFIG.CORS_PROXY_URL}${CLOCK_CONFIG.HOLIDAY_API_URL}`;
    console.log(`Fetching holidays for ${dateStr} from ${apiUrl}`);

    try {
        const holidays = await fetchWithRetry(apiUrl); // Uses default retry settings (3 retries, 1s delay)
        if (!Array.isArray(holidays)) {
            throw new Error("Invalid holiday data format received.");
        }

        const holiday = holidays.find(h => h.date === dateStr);

        if (holiday && holiday.title) {
            currentHolidayEvent = holiday.title;
            console.log(`Holiday found: ${currentHolidayEvent}`);
        } else {
            currentHolidayEvent = ""; // Ensure it's reset if no holiday
            console.log(`No public holiday found for ${dateStr}.`);
        }

    } catch (error) {
        console.error("Failed to fetch or process holidays:", error);
        currentHolidayEvent = ""; // Reset on error
        // Optionally display an error to the user in the UI
        if (elements.day) elements.day.textContent = "Holiday Error";
    }
};

/**
 * Calculates and displays the current moon phase and sunrise/sunset times.
 * Schedules itself to run periodically.
 */
const updateSunMoonInfo = () => {
    const now = new Date();

    // --- Moon Phase ---
    try {
        const moon = SunCalc.getMoonIllumination(now);
        // Determine waxing/waning based on the sign of the angle
        // angle > 0 means waning (past full), angle < 0 means waxing (before full)
        const isWaxing = moon.angle < 0;

        console.log(`Moon: fraction=${moon.fraction.toFixed(3)}, phase=${moon.phase.toFixed(3)}, angle=${moon.angle.toFixed(3)}, waxing=${isWaxing}`);

        if (elements.moon) {
            elements.moon.innerHTML = ""; // Clear previous drawing
            // Note: Using #212121 for both colors makes the moon effectively invisible unless using the background image.
            // Consider different colors if you want a visible crescent shape without the image.
            drawPlanetPhase(elements.moon, moon.fraction, isWaxing, {
                diameter: CLOCK_CONFIG.MOON_DIAMETER,
                earthshine: 0, // No earthshine effect
                blur: 0,       // Sharp terminator
                lightColour: '#212121', // Color used when phase > 0.5 (mostly lit)
                shadowColour: '#212121' // Color used when phase < 0.5 (mostly dark)
            });
        } else {
            console.warn("Moon container element not found.");
        }
    } catch (error) {
        console.error("Error calculating or drawing moon phase:", error);
    }

    // --- Sunrise/Sunset ---
    try {
        const sunTimes = SunCalc.getTimes(now, LOCATION_CONFIG.LATITUDE, LOCATION_CONFIG.LONGITUDE);
        const sunriseStr = `${addZero(sunTimes.sunrise.getHours())}:${addZero(sunTimes.sunrise.getMinutes())}`;
        const sunsetStr = `${addZero(sunTimes.sunset.getHours())}:${addZero(sunTimes.sunset.getMinutes())}`;

        if (elements.sunriseTime) {
            elements.sunriseTime.textContent = sunriseStr;
        } else {
            console.warn("Sunrise time element not found.");
        }
        if (elements.sunsetTime) {
            elements.sunsetTime.textContent = sunsetStr;
        } else {
            console.warn("Sunset time element not found.");
        }
    } catch (error) {
        console.error("Error calculating sun times:", error);
    }

};

/**
 * Updates the digital clock display (time, date, day/holiday).
 * Schedules itself to run every second.
 */
const updateClockDisplay = () => {
    const now = new Date();
    const currentDate = getLocalDateString(now);

    // --- Daily Tasks: Check for holiday when date changes ---
    if (currentDate !== lastCheckedDateForHoliday) {
        console.log(`Date changed to ${currentDate}. Fetching holiday info.`);
        lastCheckedDateForHoliday = currentDate;
        // Fetch holiday info for the new day. Don't await, let it run in the background.
        // The display will update on a subsequent tick once `currentHolidayEvent` is set.
        fetchAndSetHoliday(currentDate);
    }

    // --- Time ---
    const hours = addZero(now.getHours());
    const minutes = addZero(now.getMinutes());
    const seconds = addZero(now.getSeconds());
    const timeStr = `${hours}:${minutes}`;

    // --- Minute-based Tasks: Update Sun/Moon info when the minute changes ---
    if (seconds === '00') {
        updateSunMoonInfo();
    }

    if (elements.time) elements.time.textContent = timeStr;
    if (elements.seconds) elements.seconds.textContent = seconds;

    // --- Date ---
    const dayOfMonth = now.getDate();
    const month = now.getMonth() + 1; // getMonth is 0-indexed
    const year = now.getFullYear();
    const dateStr = `${addZero(dayOfMonth)}.${addZero(month)}.${year}`;

    if (elements.date) elements.date.textContent = dateStr;

    // --- Day / Holiday ---
    // This logic now only re-renders the #day element when its content changes.
    if (elements.day) {
        const dayName = now.toLocaleDateString('et-EE', { weekday: 'long' });
        const messageToDisplay = currentHolidayEvent || dayName;

        if (messageToDisplay !== lastDisplayedEventMessage) {
            lastDisplayedEventMessage = messageToDisplay; // Update tracker

            // Reset element state
            elements.day.innerHTML = '';
            elements.day.className = 'day'; // Use 'day' as the base class

            if (currentHolidayEvent) {
                elements.day.classList.add("cal_event");

                const textSpan = document.createElement('span');
                textSpan.innerHTML = currentHolidayEvent;
                elements.day.appendChild(textSpan);

                // Use a microtask to measure after the DOM has been updated
                Promise.resolve().then(() => {
                    const isOverflowing = textSpan.scrollWidth > elements.day.clientWidth;

                    if (isOverflowing) {
                        textSpan.classList.add('scrolling-text');
                        // Set animation duration based on text length for a consistent scroll speed
                        const scrollDistance = textSpan.scrollWidth + elements.day.clientWidth;
                        const scrollSpeed = 80; // pixels per second
                        const duration = scrollDistance / scrollSpeed;
                        textSpan.style.animationDuration = `${duration}s`;
                    }
                });
            } else {
                // It's a regular day name
                elements.day.textContent = dayName;
            }
        }
    }

    // --- Schedule Next Update ---
    const msUntilNextSecond = MS_IN_SECOND - now.getMilliseconds();
    setTimeout(updateClockDisplay, msUntilNextSecond > 0 ? msUntilNextSecond : MS_IN_SECOND);
};

// --- Initialization ---

/**
 * Initializes the clock and related features.
 */
const initializeClock = async () => {
    console.log("Initializing clock...");

    // 1. Check if all essential DOM elements exist
    const missingElements = Object.keys(elements).filter(key => !elements[key]);
    if (missingElements.length > 0) {
        missingElements.forEach(key => {
            console.error(`Initialization failed: Element with ID '${key}' not found.`);
        });
        console.error("One or more essential elements missing. Clock functionality may be limited.");
        // Decide if you want to proceed with partial functionality or stop
        // For example: return;
    }


    // 2. Fetch holiday information for the current day before starting the clock
    const currentDate = getLocalDateString(new Date());
    lastCheckedDateForHoliday = currentDate; // Prime the checker to prevent re-fetching immediately
    await fetchAndSetHoliday(currentDate);

    // 3. Start the update loops
    updateClockDisplay();
    updateSunMoonInfo(); // Initial call to populate immediately

    console.log("Clock initialized.");
};

// --- Start Everything ---
// Ensure external libraries (SunCalc, drawPlanetPhase) are loaded before initializing
if (typeof SunCalc !== 'undefined' && typeof drawPlanetPhase !== 'undefined') {
    initializeClock();
} else {
    console.error("Error: SunCalc or drawPlanetPhase library not loaded. Clock cannot initialize.");
    // Optionally display an error message in the UI
    const errorDisplay = document.getElementById('time') || document.body; // Find a place to show the error
    if (errorDisplay) errorDisplay.textContent = "Error loading libraries.";
}
