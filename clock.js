// --- Configuration & Constants ---
/*
 * NOTE: Some configuration values (LATITUDE, LONGITUDE) are duplicated
 * in weather.js. In a larger application, these should be moved to a
 * shared configuration file or module to ensure consistency.
 */
const CONFIG = {
    HOLIDAY_API_URL: 'https://xn--riigiphad-v9a.ee/et/koik?output=json',
    CORS_PROXY_URL: 'https://corsproxy.io/?',
    LATITUDE: 59.443,
    LONGITUDE: 24.738,
    MOON_DIAMETER: 70,
    SPECIAL_EVENTS: [
        { date: '03-18', message: 'PALJU &Otilde;NNE S&Uuml;NNIP&Auml;EVAKS!' }
        // Add more special events here, e.g., { date: '12-24', message: 'Jõululaupäev' }
    ],
    HOLIDAY_MAX_LENGTH_FOR_NORMAL_FONT: 31,
};

const MS_IN_MINUTE = 60000;
const MS_IN_SECOND = 1000;

// --- State ---
let currentHolidayEvent = ""; // Stores the fetched holiday/event name
let lastCheckedDateForHoliday = ""; // Tracks the date for which holidays were last fetched

// --- DOM Element Caching ---
// Cache frequently accessed elements to avoid repeated lookups
const elements = {
    day: document.getElementById('day'),
    date: document.getElementById('date'),
    time: document.getElementById('time'),
    seconds: document.getElementById('seconds'),
    moon: document.getElementById('moon'),
    sunriseTime: document.getElementById('sunrisetime'),
    sunsetTime: document.getElementById('sunsettime')
};

// --- Utility Functions ---

/**
 * Adds a leading zero to single-digit numbers.
 * @param {number} num - The number to format.
 * @returns {string} Formatted number string.
 */
const addZeroPadding = (num) => String(num).padStart(2, '0');

/**
 * Gets the date string in YYYY-MM-DD format for the local timezone from a Date object.
 * @param {Date} date - The date object to format.
 * @returns {string} Date string (e.g., "2023-04-23").
 */
const getLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = addZeroPadding(date.getMonth() + 1);
    const day = addZeroPadding(date.getDate());
    return `${year}-${month}-${day}`;
};

// --- Core Functions ---

/**
 * Fetches Estonian public holidays and checks for special events for the given date, then updates the state.
 * @param {string} dateStr - The date in YYYY-MM-DD format.
 */
const fetchAndSetHoliday = async (dateStr) => {
    // 1. Check for custom special events first (they override public holidays)
    const monthDay = dateStr.slice(5); // "YYYY-MM-DD" -> "MM-DD"
    const specialEvent = CONFIG.SPECIAL_EVENTS.find(event => event.date === monthDay);

    if (specialEvent) {
        currentHolidayEvent = specialEvent.message;
        console.log(`Special event found: ${currentHolidayEvent}`);
        return; // No need to fetch public holidays if a special event matches
    }

    // 2. Fetch public holidays
    const apiUrl = `${CONFIG.CORS_PROXY_URL}${CONFIG.HOLIDAY_API_URL}`;
    console.log(`Fetching holidays for ${dateStr} from ${apiUrl}`);

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const holidays = await response.json();

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
                diameter: CONFIG.MOON_DIAMETER,
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
        const sunTimes = SunCalc.getTimes(now, CONFIG.LATITUDE, CONFIG.LONGITUDE);
        const sunriseStr = `${addZeroPadding(sunTimes.sunrise.getHours())}:${addZeroPadding(sunTimes.sunrise.getMinutes())}`;
        const sunsetStr = `${addZeroPadding(sunTimes.sunset.getHours())}:${addZeroPadding(sunTimes.sunset.getMinutes())}`;

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

    // --- Schedule Next Update ---
    const msUntilNextMinute = MS_IN_MINUTE - (now.getSeconds() * MS_IN_SECOND) - now.getMilliseconds();
    setTimeout(updateSunMoonInfo, msUntilNextMinute > 0 ? msUntilNextMinute : MS_IN_MINUTE);
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
    const hours = addZeroPadding(now.getHours());
    const minutes = addZeroPadding(now.getMinutes());
    const seconds = addZeroPadding(now.getSeconds());
    const timeStr = `${hours}:${minutes}`;

    if (elements.time) elements.time.textContent = timeStr;
    if (elements.seconds) elements.seconds.textContent = seconds;

    // --- Date ---
    const dayOfMonth = now.getDate();
    const month = now.getMonth() + 1; // getMonth is 0-indexed
    const year = now.getFullYear();
    const dateStr = `${addZeroPadding(dayOfMonth)}.${addZeroPadding(month)}.${year}`;

    if (elements.date) elements.date.textContent = dateStr;

    // --- Day / Holiday ---
    if (elements.day) {
        if (currentHolidayEvent) {
            // Display holiday
            elements.day.innerHTML = currentHolidayEvent; // Use innerHTML for entities like &Otilde;
            elements.day.classList.add("cal_event");
            // Adjust font size based on length
            if (currentHolidayEvent.length > CONFIG.HOLIDAY_MAX_LENGTH_FOR_NORMAL_FONT) {
                elements.day.classList.add("cal_font");
            } else {
                elements.day.classList.remove("cal_font"); // Remove if shorter
            }
        } else {
            // Display regular day name
            const dayName = now.toLocaleDateString('et-EE', { weekday: 'long' });
            elements.day.textContent = dayName;
            elements.day.classList.remove("cal_event", "cal_font"); // Remove holiday styles
        }
    } else {
        console.warn("Day/Holiday element not found.");
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
    updateSunMoonInfo();

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
