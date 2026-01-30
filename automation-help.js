function waitForZoneJs() {
  return new Promise((resolve) => {
    const checkZone = () => {
      if (typeof Zone !== 'undefined' && Zone.current) {
        resolve();
      } else {
            // console.log('Zone.js !!!', window.Zone);
        // Проверяем каждые 10мс
        setTimeout(checkZone, 10);
      }
    };
    checkZone();
  });
}

// Использование
waitForZoneJs().then(() => {
  console.log('Zone.js инициализирован');
      document.addEventListener('click', (event) => {
        event.stopImmediatePropagation()
    });
});
