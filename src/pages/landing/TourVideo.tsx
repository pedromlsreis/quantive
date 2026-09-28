import { useEffect, useRef, useState } from 'react';

/**
 * The product tour clip. Nothing downloads until the frame is near the
 * viewport; it plays only while visible, never under reduced motion or data
 * saver, and always has a visible pause control (WCAG 2.2.2).
 */
export function TourVideo({ motion }: { motion: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const saveData = typeof navigator !== 'undefined' && (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  const autoplay = motion && !saveData && !userPaused;

  useEffect(() => {
    const video = ref.current;
    if (!video || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && autoplay) {
          setLoaded(true);
          video.play().catch(() => setPlaying(false));
        } else if (!entry.isIntersecting) {
          video.pause();
        }
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(video);
    const onHidden = () => document.visibilityState === 'hidden' && video.pause();
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [autoplay]);

  const toggle = () => {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      setUserPaused(false);
      setLoaded(true);
      video.play().catch(() => setPlaying(false));
    } else {
      setUserPaused(true);
      video.pause();
    }
  };

  return (
    <div className="lp-tour">
      <div className="lp-tour-frame">
        <video
          ref={ref}
          poster="/landing/dashboard.webp"
          muted
          loop
          playsInline
          preload={loaded ? 'auto' : 'none'}
          width={1440}
          height={900}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          aria-label="Screen recording of Quantive: the dashboard overview, then the allocations view cycling through treemap, bars and donut charts, then the forecast and performance pages"
        >
          <source src="/landing/tour.webm" type="video/webm" />
          <source src="/landing/tour.mp4" type="video/mp4" />
        </video>
      </div>
      <button
        type="button"
        className="lp-tour-toggle"
        onClick={toggle}
      >
        {playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="2" width="3" height="10" fill="currentColor" /><rect x="8" y="2" width="3" height="10" fill="currentColor" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2l8 5-8 5z" fill="currentColor" /></svg>
        )}
        <span>{playing ? 'Pause tour' : 'Play tour'}</span>
      </button>
    </div>
  );
}
