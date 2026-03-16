// content.js
(async () => {
  // Dynamically import Supabase
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm');

  const SUPABASE_URL = '[PASTE_URL]';
  const SUPABASE_ANON_KEY = '[PASTE_ANON]';

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  console.log('Web Agent Hand: Connected to Supabase');

  const channel = supabase.channel('browser-actions');

  channel.on('broadcast', { event: 'action' }, async (payload) => {
    console.log('Received action:', payload);
    const { jobId, action, url, selector, text, x, y } = payload.payload;

    try {
      if (action === 'navigate' && url) {
        window.location.href = url;
        // The page will reload, so we can't send success here easily without background script.
        // But we'll try to send it before unload or assume success.
        await sendResult(jobId, { url: window.location.href, success: true });
        return;
      }

      if (action === 'click') {
        if (x !== undefined && y !== undefined) {
          const el = document.elementFromPoint(x, y);
          if (el) {
            (el as HTMLElement).click();
          } else {
            throw new Error('No element found at coordinates');
          }
        } else if (selector) {
          const el = document.querySelector(selector);
          if (el) {
            el.click();
          } else {
            throw new Error('Selector not found');
          }
        }
      } else if (action === 'type' && selector && text) {
        const el = document.querySelector(selector);
        if (el) {
          el.value = text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          // Also simulate Enter key
          el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        } else {
          throw new Error('Selector not found');
        }
      }

      // Wait a bit for any UI changes
      await new Promise(r => setTimeout(r, 1000));

      // Capture screenshot (requires background script or html2canvas in content script)
      // Since chrome.tabs.captureVisibleTab is only in background, we'll ask background to do it.
      // For simplicity, if we don't have a background script, we can use a basic approach or just return success.
      // The prompt says: "Ensure the Chrome Extension captures a Base64 screenshot after every successful action and sends it back to the AI so I can see what it did."
      // Let's send a message to the background script to capture the screenshot.
      chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' }, async (response) => {
        const screenshot = response?.screenshot || null;
        await sendResult(jobId, { url: window.location.href, success: true, screenshot });
      });

    } catch (error) {
      console.error('Action error:', error);
      await sendResult(jobId, { error: error.message });
    }
  });

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      console.log('Subscribed to browser-actions');
    }
  });

  async function sendResult(jobId, result) {
    const resultsChannel = supabase.channel('browser-results');
    await resultsChannel.send({
      type: 'broadcast',
      event: 'result',
      payload: { jobId, ...result }
    });
  }
})();
