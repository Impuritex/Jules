const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');
const handler = require('serve-handler');

// Serve dist folder
const server = http.createServer((request, response) => {
  return handler(request, response, {
    public: path.join(__dirname, '../dist')
  });
});

server.listen(3000, async () => {
  console.log('Running at http://localhost:3000');

  try {
    const browser = await chromium.launch({
      headless: true
    });
    const page = await browser.newPage();

    // Set viewport to resemble the app window size
    await page.setViewportSize({ width: 1200, height: 800 });

    // Mock the electron object
    await page.addInitScript(() => {
        window.electron = {
            checkAccountExists: async () => false, // Ensure Create Account screen or Login screen appears
            createAccount: async () => ({ success: true }),
            login: async () => ({ success: false, error: 'Mock Login' }),
            onBlur: () => {},
            onFocus: () => {},
            onWiped: () => {}
        };
    });

    console.log('Navigating to app...');
    await page.goto('http://localhost:3000');

    // It should load either Create Account or Login depending on mock
    // Default mock checkAccountExists returns false, so "Setup Account" should appear
    // Wait for something to appear
    await page.waitForTimeout(2000); // Give React time to mount and run effect

    console.log('Taking screenshot...');
    await page.screenshot({ path: 'screenshot.png' });

    console.log('Screenshot saved to screenshot.png');

    await browser.close();
  } catch (err) {
    console.error('Error taking screenshot:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
