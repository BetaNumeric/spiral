/* Installation-guide SVG renderer. Load qrcodegen.js first. */
(function (root) {
    'use strict';

    function toSvg(url) {
        if (typeof url !== 'string' || !url) {
            throw new TypeError('A non-empty installation URL is required.');
        }

        const { QrCode, QrSegment } = qrcodegen;
        const segments = QrSegment.makeSegments(url);
        // Explicit UTF-8 ECI makes international URLs readable by QR scanners.
        if (/[^\x00-\x7f]/.test(url)) segments.unshift(QrSegment.makeEci(26));
        const qr = QrCode.encodeSegments(segments, QrCode.Ecc.MEDIUM);
        const border = 4;
        const size = qr.size + border * 2;
        const paths = [];
        for (let y = 0; y < qr.size; y++) {
            for (let x = 0; x < qr.size;) {
                if (!qr.getModule(x, y)) {
                    x++;
                    continue;
                }
                const start = x;
                while (x < qr.size && qr.getModule(x, y)) x++;
                paths.push(`M${start + border},${y + border}h${x - start}v1h-${x - start}z`);
            }
        }
        // All interpolated values are generated integers; the URL never enters markup.
        // Fixed black-on-white colors and a four-module quiet zone also work in dark mode.
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="232" height="232" role="img" aria-label="Scan to open the Spiral installation guide" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${paths.join('')}" fill="#000"/></svg>`;
    }

    root.SpiralInstallQR = Object.freeze({ toSvg });
})(window);
