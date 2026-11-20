// SOC-18.5 D: save a made reel to her phone. Plain script; 13.6b adds its other functions to this same object.
(function () {
  const OneReel = window.OneReel || {};
  // share is the first awaited call after her tap; nothing is fetched before it.
  OneReel.save = async function save(file, nav) {
    nav = nav || navigator;
    if (nav.canShare && nav.canShare({ files: [file] })) {
      try { await nav.share({ files: [file] }); return 'shared'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; throw e; }
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = file.name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
  };
  window.OneReel = OneReel;
})();
