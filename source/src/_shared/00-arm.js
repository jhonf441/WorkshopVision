      // THE time a first tap of a double tap stays armed (DESIGN.md section 5, level 2). One value for the whole family: every plugin, the service
      // page (dwc36/arm-ms.js, a twin of vue/_shared36/arm-ms.js) and the Vue pages use 4 s. tests/arm-ms.test.js fails when another value appears.
      var WORKSHOP_ARM_MS = 4000;
