import { useEffect, useMemo, useRef, useState } from 'react';

type TempoFeedback = 'idle' | 'listening' | 'good' | 'fast' | 'slow';
type VolumeFeedback = 'good' | 'quiet' | 'loud';

type Option = {
  value: number;
  label: string;
};

type DropdownProps = {
  label: string;
  value: number;
  options: Option[];
  buttonText?: string;
  onChange: (next: number) => void;
  disabled?: boolean;
};

function LevelDropdown({
  label,
  value,
  options,
  buttonText,
  onChange,
  disabled = false
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
    <div className="dropdown" ref={rootRef}>
      <div className="dropdownLabel">{label}</div>
      <button
        type="button"
        className="dropdownButton"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{buttonText ?? String(value)}</span>
        {open ? <span className="dropdownArrow">▾</span> : null}
      </button>
      {open ? (
        <div className="dropdownMenu" role="listbox" aria-label={`${label} options`}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`dropdownOption ${option.value === value ? 'selected' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const tempoLevels: Option[] = [
  { value: 1, label: '1 (slow)' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
  { value: 7, label: '7' },
  { value: 8, label: '8' },
  { value: 9, label: '9' },
  { value: 10, label: '10 (fast)' }
];

const volumeLevels: Option[] = [
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' }
];

function mapTempoLevelToBpm(level: number) {
  const minBpm = 40;
  const maxBpm = 180;
  const step = (maxBpm - minBpm) / 9;
  return Math.round(minBpm + (level - 1) * step);
}

function mapVolumeLevelToTargetEnergy(level: number) {
  if (level === 1) return 0.045;
  if (level === 2) return 0.065;
  return 0.09;
}

function getVolumeRules(level: number) {
  if (level === 1) {
    return {
      quietOffset: 0.015,
      loudOffset: 0.03,
      quietConfirmations: 2,
      loudConfirmations: 2
    };
  }

  if (level === 2) {
    return {
      quietOffset: 0.015,
      loudOffset: 0.035,
      quietConfirmations: 2,
      loudConfirmations: 2
    };
  }

  return {
    quietOffset: 0.02,
    loudOffset: 0.055,
    quietConfirmations: 2,
    loudConfirmations: 4
  };
}

function getTempoFeedbackText(value: TempoFeedback) {
  if (value === 'idle') return 'Press Start';
  if (value === 'good') return 'Good!';
  if (value === 'fast') return 'Too fast';
  if (value === 'slow') return 'Too slow';
  return 'Listening...';
}

function getVolumeFeedbackText(value: VolumeFeedback) {
  if (value === 'quiet') return 'Too quiet';
  if (value === 'loud') return 'Too loud';
  return 'Good volume';
}

function getTempoFeedbackIcon(value: TempoFeedback) {
  if (value === 'fast') return '↓';
  if (value === 'slow') return '↑';
  if (value === 'good') return '✓';
  if (value === 'listening') return '↕';
  return '•';
}

function getVolumeFeedbackIcon(value: VolumeFeedback) {
  if (value === 'loud') return '↓';
  if (value === 'quiet') return '↑';
  return '✓';
}

export default function App() {
  const [tempoLevel, setTempoLevel] = useState(3);
  const [volumeLevel, setVolumeLevel] = useState(2);
  const [running, setRunning] = useState(false);
  const [blink, setBlink] = useState(false);
  const [tempoFeedback, setTempoFeedback] = useState<TempoFeedback>('idle');
  const [userTapBpm, setUserTapBpm] = useState<number | null>(null);
  const [volumeFeedback, setVolumeFeedback] = useState<VolumeFeedback>('good');
  const [score, setScore] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const noiseFloorRef = useRef(0.01);
  const lastDetectionRef = useRef(0);
  const lastHitRef = useRef<number | null>(null);
  const tapIntervalsRef = useRef<number[]>([]);
  const loudEvidenceRef = useRef(0);
  const quietEvidenceRef = useRef(0);
  const loudStreakRef = useRef(0);
  const quietStreakRef = useRef(0);
  const tempoIsGoodRef = useRef(false);
  const goodTempoMsRef = useRef(0);
  const lastFrameTimeRef = useRef<number | null>(null);
  const scoredMilestonesRef = useRef({
    threeSeconds: false,
    fiveSeconds: false,
    tenSeconds: false
  });
  const listeningStartedAtRef = useRef<number | null>(null);
  const blinkTimeoutRef = useRef<number | null>(null);

  const bpm = useMemo(() => mapTempoLevelToBpm(tempoLevel), [tempoLevel]);
  const beatIntervalMs = useMemo(() => 60000 / bpm, [bpm]);
  const volumeLabel = useMemo(() => {
    const selected = volumeLevels.find((item) => item.value === volumeLevel);
    return selected?.label ?? String(volumeLevel);
  }, [volumeLevel]);

  useEffect(() => {
    if (!running) return;

    const intervalId = window.setInterval(() => {
      setBlink(true);
      if (blinkTimeoutRef.current !== null) {
        window.clearTimeout(blinkTimeoutRef.current);
      }
      blinkTimeoutRef.current = window.setTimeout(() => setBlink(false), 130);
    }, beatIntervalMs);

    return () => {
      window.clearInterval(intervalId);
      if (blinkTimeoutRef.current !== null) {
        window.clearTimeout(blinkTimeoutRef.current);
      }
      setBlink(false);
    };
  }, [running, beatIntervalMs]);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  function stopListening() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    dataRef.current = null;
    lastHitRef.current = null;
    tapIntervalsRef.current = [];
    listeningStartedAtRef.current = null;
    lastDetectionRef.current = 0;
    noiseFloorRef.current = 0.01;
    loudEvidenceRef.current = 0;
    quietEvidenceRef.current = 0;
    loudStreakRef.current = 0;
    quietStreakRef.current = 0;
    tempoIsGoodRef.current = false;
    goodTempoMsRef.current = 0;
    lastFrameTimeRef.current = null;
    scoredMilestonesRef.current = {
      threeSeconds: false,
      fiveSeconds: false,
      tenSeconds: false
    };
    setMicLevel(0);
    setUserTapBpm(null);
    setTempoFeedback('idle');
  }

  function classifyTempoFromBpm(tapBpm: number) {
    const tolerance = bpm * 0.15;
    if (Math.abs(tapBpm - bpm) <= tolerance) {
      tempoIsGoodRef.current = true;
      setTempoFeedback('good');
    } else if (tapBpm > bpm) {
      tempoIsGoodRef.current = false;
      setTempoFeedback('fast');
    } else {
      tempoIsGoodRef.current = false;
      setTempoFeedback('slow');
    }
  }

  function resetScoring(resetPoints: boolean) {
    tempoIsGoodRef.current = false;
    goodTempoMsRef.current = 0;
    lastFrameTimeRef.current = null;
    scoredMilestonesRef.current = {
      threeSeconds: false,
      fiveSeconds: false,
      tenSeconds: false
    };

    if (resetPoints) {
      setScore(0);
    }
  }

  function applyScoreMilestones() {
    const goodSeconds = goodTempoMsRef.current / 1000;
    if (goodSeconds >= 3 && !scoredMilestonesRef.current.threeSeconds) {
      scoredMilestonesRef.current.threeSeconds = true;
      setScore((prev) => prev + 1);
    }

    if (goodSeconds >= 5 && !scoredMilestonesRef.current.fiveSeconds) {
      scoredMilestonesRef.current.fiveSeconds = true;
      setScore((prev) => prev + 2);
    }

    if (goodSeconds >= 10 && !scoredMilestonesRef.current.tenSeconds) {
      scoredMilestonesRef.current.tenSeconds = true;
      setScore((prev) => prev + 10);
    }
  }

  function handleRandomize() {
    if (running) return;
    setTempoLevel(Math.floor(Math.random() * 10) + 1);
    setVolumeLevel(Math.floor(Math.random() * 3) + 1);
    setErrorMessage('');
  }

  function handleFullReset() {
    setRunning(false);
    stopListening();
    setTempoLevel(3);
    setVolumeLevel(2);
    setVolumeFeedback('good');
    setErrorMessage('');
    setScore(0);
  }

  async function startListening() {
    stopListening();
    setErrorMessage('');
    setTempoFeedback('listening');
    setVolumeFeedback('good');
    setUserTapBpm(null);
    setMicLevel(0);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);

      const data = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      streamRef.current = stream;
      audioContextRef.current = context;
      analyserRef.current = analyser;
      dataRef.current = data;
      listeningStartedAtRef.current = performance.now();
      resetScoring(false);

      const run = () => {
        const activeAnalyser = analyserRef.current;
        const activeData = dataRef.current;
        if (!activeAnalyser || !activeData) return;

        activeAnalyser.getByteTimeDomainData(activeData);

        let sum = 0;
        for (let i = 0; i < activeData.length; i += 1) {
          const normalized = (activeData[i] - 128) / 128;
          sum += normalized * normalized;
        }

        const rms = Math.sqrt(sum / activeData.length);
        setMicLevel(Math.min(1, rms * 10));

        const floor = noiseFloorRef.current;
        const floorUpdateCutoff = floor + 0.02;
        if (rms < floorUpdateCutoff) {
          const floorSmoothing = rms < floor ? 0.08 : 0.02;
          noiseFloorRef.current = floor + (rms - floor) * floorSmoothing;
        } else {
          noiseFloorRef.current = floor * 0.995;
        }

        const volumeTarget = mapVolumeLevelToTargetEnergy(volumeLevel);
        const threshold = noiseFloorRef.current + volumeTarget * 0.38;
        const now = performance.now();
        const minSpacingMs = 120;
        const minTapIntervalMs = 220;
        const maxTapIntervalMs = 2500;

        if (rms > threshold && now - lastDetectionRef.current > minSpacingMs) {
          lastDetectionRef.current = now;

          const volumeRules = getVolumeRules(volumeLevel);
          const isQuietHit = rms < volumeTarget - volumeRules.quietOffset;
          const isLoudHit = rms > volumeTarget + volumeRules.loudOffset;

          if (isQuietHit) {
            quietEvidenceRef.current = Math.min(quietEvidenceRef.current + 1, 4);
            loudEvidenceRef.current = Math.max(loudEvidenceRef.current - 1, 0);
            quietStreakRef.current += 1;
            loudStreakRef.current = 0;
          } else if (isLoudHit) {
            loudEvidenceRef.current = Math.min(loudEvidenceRef.current + 1, 4);
            quietEvidenceRef.current = Math.max(quietEvidenceRef.current - 1, 0);
            loudStreakRef.current += 1;
            quietStreakRef.current = 0;
          } else {
            loudEvidenceRef.current = Math.max(loudEvidenceRef.current - 1, 0);
            quietEvidenceRef.current = Math.max(quietEvidenceRef.current - 1, 0);
            loudStreakRef.current = 0;
            quietStreakRef.current = 0;
          }

          const loudConfirmed =
            loudEvidenceRef.current >= volumeRules.loudConfirmations &&
            loudStreakRef.current >= volumeRules.loudConfirmations;
          const quietConfirmed =
            quietEvidenceRef.current >= volumeRules.quietConfirmations &&
            quietStreakRef.current >= volumeRules.quietConfirmations;

          if (loudConfirmed) {
            setVolumeFeedback('loud');
          } else if (quietConfirmed) {
            setVolumeFeedback('quiet');
          } else {
            setVolumeFeedback('good');
          }

          const previousHit = lastHitRef.current;
          if (previousHit === null) {
            lastHitRef.current = now;
          } else {
            const interval = now - previousHit;
            if (interval >= minTapIntervalMs && interval <= maxTapIntervalMs) {
              tapIntervalsRef.current.push(interval);
              if (tapIntervalsRef.current.length > 4) {
                tapIntervalsRef.current.shift();
              }

              const averageInterval =
                tapIntervalsRef.current.reduce((sum, item) => sum + item, 0) / tapIntervalsRef.current.length;
              const computedBpm = 60000 / averageInterval;
              setUserTapBpm(Math.round(computedBpm));
              classifyTempoFromBpm(computedBpm);
              lastHitRef.current = now;
            }
          }
        }

        const lastHit = lastHitRef.current;
        if (lastHit !== null && now - lastHit > beatIntervalMs * 1.2) {
          tempoIsGoodRef.current = false;
          setTempoFeedback('slow');
        } else if (lastHit === null && listeningStartedAtRef.current !== null) {
          if (now - listeningStartedAtRef.current > beatIntervalMs * 1.2) {
            tempoIsGoodRef.current = false;
            setTempoFeedback('slow');
          }
        }

        const previousFrameTime = lastFrameTimeRef.current;
        lastFrameTimeRef.current = now;

        if (tempoIsGoodRef.current && previousFrameTime !== null) {
          goodTempoMsRef.current += now - previousFrameTime;
          applyScoreMilestones();
        } else {
          goodTempoMsRef.current = 0;
          scoredMilestonesRef.current = {
            threeSeconds: false,
            fiveSeconds: false,
            tenSeconds: false
          };
        }

        rafRef.current = requestAnimationFrame(run);
      };

      setTempoFeedback('listening');
      setVolumeFeedback('good');
      rafRef.current = requestAnimationFrame(run);
    } catch {
      setErrorMessage('Microphone access is required. Please allow mic permission and try again.');
      setRunning(false);
      stopListening();
    }
  }

  async function handleStartStop() {
    if (running) {
      setRunning(false);
      stopListening();
      return;
    }

    setScore(0);
    resetScoring(false);
    setRunning(true);
    await startListening();
  }

  return (
    <main className="appShell">
      <section className="panel">
        <h1>{running ? 'Tempo Beat! Let’s go!' : 'Tempo Beat!'}</h1>

        <div className="setupArea">
          <div className="controls">
            <LevelDropdown
              label="Tempo (1-10)"
              value={tempoLevel}
              buttonText={String(tempoLevel)}
              options={tempoLevels}
              onChange={setTempoLevel}
              disabled={running}
            />
            <LevelDropdown
              label="Volume (1-3)"
              value={volumeLevel}
              buttonText={volumeLabel}
              options={volumeLevels}
              onChange={setVolumeLevel}
              disabled={running}
            />
          </div>

          <div className="actionRow">
            <button type="button" className={`startButton ${running ? 'running' : ''}`} onClick={handleStartStop}>
              {running ? 'Stop' : 'Start'}
            </button>
            <button type="button" className="secondaryButton" onClick={handleRandomize} disabled={running}>
              🎲 Random
            </button>
            <button type="button" className="secondaryButton reset" onClick={handleFullReset}>
              ↺ Reset
            </button>
          </div>
        </div>

        <div className="gameArea">
          <div className="scoreCard">
            <div className="scoreLabel">Points</div>
            <div className="scoreValue">⭐ {score}</div>
          </div>

          <div className="targetArea">
            <div className={`blinkSquare ${blink ? 'on' : ''}`} />
            <div className="statusLabel">Target BPM: {bpm}</div>
          </div>

          <div className="feedbackArea">
            <div className="feedbackBlock">
              <div className="feedbackTitleRow">
                <div className="feedbackTitle">Tempo feedback</div>
                <div className="feedbackMeta">Your BPM: {userTapBpm ?? '--'}</div>
              </div>
              <div className="feedbackBody">
                <span className="feedbackIcon">{getTempoFeedbackIcon(tempoFeedback)}</span>
                <div className="feedbackTextGroup">
                  <div className={`tempoFeedback ${tempoFeedback}`}>{getTempoFeedbackText(tempoFeedback)}</div>
                </div>
              </div>
            </div>

            <div className="feedbackBlock">
              <div className="feedbackTitle">Volume feedback</div>
              <div className="feedbackBody">
                <span className="feedbackIcon">{getVolumeFeedbackIcon(volumeFeedback)}</span>
                <div className="feedbackTextGroup">
                  <div className={`volumeFeedback ${volumeFeedback}`}>{getVolumeFeedbackText(volumeFeedback)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="meterRow">
          <div className="meterLabel">Mic level</div>
          <div className="meterTrack">
            <div className="meterFill" style={{ width: `${Math.round(micLevel * 100)}%` }} />
          </div>
        </div>

        {errorMessage ? <p className="errorText">{errorMessage}</p> : null}
      </section>
    </main>
  );
}
