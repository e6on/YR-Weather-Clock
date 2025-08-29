/*
 * Defines the function 'drawPlanetPhase' which renders a realistic lunar or planetary disc with a shadow.
 * This is a modernized version of the original script from http://codebox.org.uk/pages/planet-phase.
 *
 * Copyright 2014 Rob Dawson, with modifications.
 *
 * @param {HTMLElement} containerEl - The HTML element to contain the disc.
 * @param {number} phase - A value between 0 and 1 indicating the illumination fraction.
 *                         0=new, 0.25=crescent, 0.5=quarter, 0.75=gibbous, 1=full.
 * @param {boolean} isWaxing - True if the disc is waxing (shadow on the left), false if waning.
 * @param {object} [userConfig={}] - Optional configuration to override default appearance.
*/

const drawPlanetPhase = (function () {
    "use strict";

    const defaultConfig = {
        shadowColour: 'black',    // CSS background-color for the shaded part of the disc.
        lightColour: 'white',     // CSS background-color for the illuminated part.
        diameter: 100,            // Diameter of the disc in pixels.
        earthshine: 0.1,          // Amount of light on the shaded part (0=none, 1=full).
        blur: 3,                  // Blur radius for the terminator line in pixels.
        moonImage: "url('./images/common/moon.png')" // Path to the texture image.
    };

    /**
     * Calculates the diameter and offset for the inner (terminator) circle.
     * @param {number} outerDiameter - The diameter of the main disc.
     * @param {number} semiPhase - The phase from -1 to 1.
     * @returns {{d: number, o: number}} Diameter and offset of the inner circle.
     */
    const calcInner = (outerDiameter, semiPhase) => {
        const absPhase = Math.abs(semiPhase);
        // 'n' is the width of the sliver of the circle that is not shadowed.
        const n = ((1 - absPhase) * outerDiameter / 2) || 0.01; // Use 0.01 to avoid division by zero.

        const innerRadius = n / 2 + (outerDiameter * outerDiameter) / (8 * n);

        return {
            d: innerRadius * 2,
            o: semiPhase > 0 ? (outerDiameter / 2 - n) : (-2 * innerRadius + outerDiameter / 2 + n)
        };
    };

    /**
     * Applies a set of CSS properties to an element.
     * @param {HTMLElement} el - The element to style.
     * @param {object} props - An object of CSS properties.
     */
    const setCss = (el, props) => {
        Object.assign(el.style, props);
    };

    /**
     * Creates and styles the two divs that form the planet and shadow.
     * @param {object} outer - Properties for the outer disc.
     * @param {object} inner - Properties for the inner (terminator) disc.
     * @param {number} blurSize - The pixel size of the terminator blur.
     */
    const drawDiscs = (outer, inner, blurSize) => {
        const blurredDiameter = inner.diameter - blurSize;
        const blurredOffset = inner.offset + blurSize / 2;

        // This calculation is crucial for keeping the background texture aligned
        // as the inner (terminator) disc moves across the outer disc. It compensates
        // for the `left` offset of the inner disc.
        const bgPosFix = outer.diameter - inner.offset * 2;

        setCss(outer.box, {
            position: 'relative',
            backgroundImage: outer.bgImage,
            backgroundSize: `${outer.diameter}px`,
            height: `${outer.diameter}px`,
            width: `${outer.diameter}px`,
            border: '1px solid black',
            backgroundColor: outer.colour,
            borderRadius: `${outer.diameter / 2}px`,
            overflow: 'hidden'
        });

        setCss(inner.box, {
            position: 'absolute',
            backgroundImage: inner.bgImage,
            backgroundSize: `${outer.diameter}px`,
            // The complex backgroundPosition ensures the texture on the inner disc
            // aligns perfectly with where the texture on the outer disc would be.
            backgroundPosition: `${Math.abs(blurredOffset + bgPosFix)}px ${Math.abs((outer.diameter - blurredDiameter) / 2)}px`,
            backgroundColor: inner.colour,
            borderRadius: `${blurredDiameter / 2}px`,
            height: `${blurredDiameter}px`,
            width: `${blurredDiameter}px`,
            left: `${blurredOffset}px`,
            top: `${(outer.diameter - blurredDiameter) / 2}px`,
            boxShadow: `0px 0px ${blurSize}px ${blurSize}px ${inner.colour}`,
            opacity: inner.opacity
        });
    };

    /**
     * Creates a new div and appends it to a container.
     * @param {HTMLElement} container - The parent element.
     * @returns {HTMLElement} The newly created div.
     */
    const makeDiv = (container) => {
        const div = document.createElement('div');
        container.appendChild(div);
        return div;
    };

    /**
     * Determines disc properties and initiates the drawing.
     * @param {HTMLElement} outerBox - The container for the main disc.
     * @param {number} phase - The illumination fraction (0-1).
     * @param {boolean} isWaxing - True if waxing.
     * @param {object} config - The final, merged configuration object.
     */
    const setPhase = (outerBox, phase, isWaxing, config) => {
        const innerBox = makeDiv(outerBox);

        const isMostlyDark = phase < 0.5;
        // The "terminator" is the shadow line. Its curvature depends on the phase.
        const terminatorPhase = isMostlyDark ? phase : 1 - phase;
        // The direction of the curve depends on whether it's waxing or waning.
        const terminatorDirection = ((isMostlyDark && isWaxing) || (!isMostlyDark && !isWaxing)) ? -1 : 1;

        const outerDisc = {
            box: outerBox,
            diameter: config.diameter,
            // If mostly dark, the outer disc is the lit crescent. If mostly light, it's the shadow crescent.
            colour: isMostlyDark ? config.lightColour : config.shadowColour,
            bgImage: isMostlyDark ? config.moonImage : 'none',
        };

        const innerDisc = {
            box: innerBox,
            colour: isMostlyDark ? config.shadowColour : config.lightColour,
            bgImage: isMostlyDark ? 'none' : config.moonImage,
            opacity: 1 - config.earthshine,
        };

        // Calculate the geometry of the inner disc which creates the terminator line.
        const innerVals = calcInner(config.diameter, terminatorPhase * 2 * terminatorDirection);
        innerDisc.diameter = innerVals.d;
        innerDisc.offset = innerVals.o;

        drawDiscs(outerDisc, innerDisc, config.blur);
    };

    return (containerEl, phase, isWaxing, userConfig = {}) => {
        // Merge user-provided config with defaults.
        const config = { ...defaultConfig, ...userConfig };

        // Create the main container div for the planet disc.
        const el = makeDiv(containerEl);
        setPhase(el, phase, isWaxing, config);
    };

})();
