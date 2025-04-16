// --- Configuration & Constants ---
const HOLIDAY_API_URL = 'https://xn--riigiphad-v9a.ee/et/koik?output=json';
const CORS_PROXY_URL = 'https://corsproxy.io/?';
const LATITUDE = 59.443;
const LONGITUDE = 24.738;
const MOON_DIAMETER = 70;
const MS_IN_MINUTE = 60000;
const MS_IN_SECOND = 1000;

// --- State ---
let currentHolidayEvent = ""; // Stores the fetched holiday/event name

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
const addZeroPadding = (num) => (num < 10 ? '0' : '') + num;

/**
 * Gets the current date string in YYYY-MM-DD format, adjusted for local timezone.
 * @returns {string} Date string (e.g., "2023-04-23").
 */
const getCurrentISODateString = () => {
    const now = new Date();
    // Adjust date object to reflect local date before converting to ISO string
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * MS_IN_MINUTE);
    return localDate.toISOString().slice(0, 10); // Extracts YYYY-MM-DD part
};

// --- Core Functions ---

/**
 * Fetches Estonian public holidays for the given date and updates the state.
 * Also checks for a hardcoded birthday.
 * @param {string} dateStr - The date in YYYY-MM-DD format.
 */
const fetchAndSetHoliday = async (dateStr) => {
    // 1. Check hardcoded birthday first (overrides public holidays)
    const currentYear = new Date().getFullYear();
    if (dateStr === `${currentYear}-03-18`) {
        currentHolidayEvent = "PALJU &Otilde;NNE S&Uuml;NNIP&Auml;EVAKS!";
        console.log(`Special event found: ${currentHolidayEvent}`);
        // No need to fetch public holidays if birthday matches
        return;
    }

    // 2. Fetch public holidays
    const apiUrl = `${CORS_PROXY_URL}${HOLIDAY_API_URL}`;
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
                diameter: MOON_DIAMETER,
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
        const sunTimes = SunCalc.getTimes(now, LATITUDE, LONGITUDE);
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
    setTimeout(updateSunMoonInfo, MS_IN_MINUTE); // Update every minute
};

/**
 * Updates the digital clock display (time, date, day/holiday).
 * Schedules itself to run every second.
 */
const updateClockDisplay = () => {
    const now = new Date();

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
            elements.day.textContent = currentHolidayEvent;
            elements.day.classList.add("cal_event");
            // Adjust font size based on length
            if (currentHolidayEvent.length > 31) {
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
    setTimeout(updateClockDisplay, MS_IN_SECOND); // Update every second
};

// --- Initialization ---

/**
 * Initializes the clock and related features.
 */
const initializeClock = async () => {
    console.log("Initializing clock...");

    // 1. Check if all essential DOM elements exist
    let essentialElementsFound = true;
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`Initialization failed: Element with ID '${key}' not found.`);
            essentialElementsFound = false;
            // Display a general error to the user if critical elements are missing
            // document.body.innerHTML = "Error loading clock components.";
            // return; // Stop initialization if critical elements are missing
        }
    }
     if (!essentialElementsFound) {
         console.error("One or more essential elements missing. Clock functionality may be limited.");
         // Decide if you want to proceed with partial functionality or stop
     }


    // 2. Fetch holiday information asynchronously
    const isoDate = getCurrentISODateString();
    await fetchAndSetHoliday(isoDate); // Wait for holiday info before potentially first clock update uses it

    // 3. Start the clock update loop
    updateClockDisplay();

    // 4. Start the sun/moon update loop
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
