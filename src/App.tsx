import { useState, useEffect } from 'react';

// Tipi
type GamePhase = 'select-pc' | 'cover-image' | 'intro' | 'phase-1' | 'phase-2' | 'phase-3' | 'phase-4' | 'phase-5';
type Team = 'arancioni' | 'ottanio' | null;
type BiasStep = 'story' | 'preference' | 'prediction' | 'iat-intro' | 'iat-block1' | 'iat-interlude' | 'iat-block2' | 'iat-feedback' | 'memory-intro' | 'memory-game' | 'memory-feedback' | 'gonogo-intro' | 'gonogo-game' | 'gonogo-loading' | 'gonogo-result';

type MemoryCard = {
  uniqueId: number;
  pairId: number;
  team: 'arancioni' | 'ottanio';
  job: string;
  icon: string;
  img: string;
};

type FallingItem = {
  id: number;
  type: 'go' | 'sasso' | 'foglia'; 
  icon: string;
  x: number;
  y: number;
  dy: number;
  rotation: number;
};

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const IMG_ARANCIONE = asset('suricato-arancione.png');
const IMG_OTTANIO = asset('suricato-ottanio.png');

// LA GRANDE FRASE FINALE DIVISA IN ESATTAMENTE 30 PEZZI
const MASTER_WORDS = [
  "DA", "SOLI", "SI", "CORRE", "VELOCI,",
  "MA", "INSIEME", "SI", "VA", "PIÙ",
  "LONTANO.", "L'ACQUA", "NON", "È", "DI",
  "UN", "SOLO", "CLAN,", "MA", "È",
  "DI", "TUTTI.", "UNIAMO", "LE", "FORZE",
  "E", "SALVIAMO", "LA", "NOSTRA", "OASI!"
];

// FUNZIONE DI MESCOLAMENTO SINCRONIZZATO (PRNG deterministico)
function getScatteredChunks(totalPcs: number) {
  const baseCount = Math.floor(MASTER_WORDS.length / totalPcs);
  let remainder = MASTER_WORDS.length % totalPcs;

  const chunks = [];
  let startIndex = 0;
  
  for (let i = 0; i < totalPcs; i++) {
    const myCount = baseCount + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    
    chunks.push({
      logicalOrder: i + 1,
      text: MASTER_WORDS.slice(startIndex, startIndex + myCount).join(" ")
    });
    
    startIndex += myCount;
  }

  let seed = 42; 
  const random = () => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  };

  const shuffled = [...chunks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

export default function App() {
  const [currentPhase, setCurrentPhase] = useState<GamePhase>('select-pc');
  const [totalPcs, setTotalPcs] = useState<number>(20); 
  const [pcNumber, setPcNumber] = useState<number | null>(null);
  const [team, setTeam] = useState<Team>(null);
  
  // Stati Fase 1 (Gruppi Minimi)
  const [sortingStep, setSortingStep] = useState<'instructions' | 'image' | 'choice' | 'loading' | 'result'>('instructions');
  const [timeLeft, setTimeLeft] = useState(10); 

  // Stati Fase 2 (Conformismo)
  const [conformityStep, setConformityStep] = useState<'question' | 'feedback'>('question');
  const [conformed, setConformed] = useState<boolean | null>(null);

  // Stati Fase 3 
  const [biasStep, setBiasStep] = useState<BiasStep>('story');
  const [, setPreferredWinner] = useState<Team>(null);
  const [, setPredictedWinner] = useState<Team>(null);
  
  // IAT
  const [iatTrialIndex, setIatTrialIndex] = useState(0);
  const [iatError, setIatError] = useState(false);
  const [, setIatDifficultyChoice] = useState<string | null>(null);

  // Memory
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<number[]>([]);
  const [ingroupErrors, setIngroupErrors] = useState(0);
  const [outgroupErrors, setOutgroupErrors] = useState(0);
  const [isLocked, setIsLocked] = useState(false);

  // Go/No-Go - Caccia al Volo (Pioggia) impostato a 120 secondi (2 minuti)
  const [gonogoTimeLeft, setGonogoTimeLeft] = useState(120); 
  const [gonogoScore, setGonogoScore] = useState(0);
  const [fallingItems, setFallingItems] = useState<FallingItem[]>([]);
  const [gonogoFlash, setGonogoFlash] = useState<'success' | 'error' | null>(null);
  const [gonogoLoadingReady, setGonogoLoadingReady] = useState(false); 

  const ingroupName = team === 'arancioni' ? 'Arancioni' : 'Ottanio';
  const outgroupName = team === 'arancioni' ? 'Ottanio' : 'Arancioni';

  // SEQUENZE DA 40 TRIAL PER IL CHILD-IAT
  const block1Sequence = [
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😊 Felice', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '☹️ Triste', correct: 'right' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😠 Arrabbiato', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😃 Sorriso', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '🎉 Festa', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😢 Pianto', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😊 Felice', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😠 Arrabbiato', correct: 'right' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '☹️ Triste', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😃 Sorriso', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '🎉 Festa', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😢 Pianto', correct: 'right' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😊 Felice', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '☹️ Triste', correct: 'right' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😠 Arrabbiato', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😃 Sorriso', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '🎉 Festa', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😢 Pianto', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😊 Felice', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '☹️ Triste', correct: 'right' }
  ];

  const block2Sequence = [
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '☹️ Triste', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😊 Felice', correct: 'right' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😃 Sorriso', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😠 Arrabbiato', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😢 Pianto', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '🎉 Festa', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '☹️ Triste', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😃 Sorriso', correct: 'right' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😊 Felice', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😠 Arrabbiato', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😢 Pianto', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '🎉 Festa', correct: 'right' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '☹️ Triste', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😊 Felice', correct: 'right' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😃 Sorriso', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😠 Arrabbiato', correct: 'left' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '😢 Pianto', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '🎉 Festa', correct: 'right' },
    { type: 'image', content: outgroupName, correct: 'right' },
    { type: 'text', content: '☹️ Triste', correct: 'left' },
    { type: 'image', content: ingroupName, correct: 'left' },
    { type: 'text', content: '😊 Felice', correct: 'right' }
  ];

  useEffect(() => {
    if (sortingStep === 'image') {
      setTimeLeft(10);
      const timerId = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerId);
            setSortingStep('choice');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timerId);
    }
  }, [sortingStep]);

  const handleIatClick = (side: 'left' | 'right', currentSequence: any[]) => {
    if (currentSequence[iatTrialIndex].correct === side) {
      setIatError(false);
      if (iatTrialIndex + 1 < currentSequence.length) {
        setIatTrialIndex(prev => prev + 1);
      } else {
        if (biasStep === 'iat-block1') {
          setBiasStep('iat-interlude');
          setIatTrialIndex(0);
        } else if (biasStep === 'iat-block2') {
          setBiasStep('iat-feedback');
          setIatTrialIndex(0);
        }
      }
    } else {
      setIatError(true);
      setTimeout(() => setIatError(false), 400); 
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (biasStep !== 'iat-block1' && biasStep !== 'iat-block2') return;
      const currentSequence = biasStep === 'iat-block1' ? block1Sequence : block2Sequence;
      if (e.key.toLowerCase() === 'q') handleIatClick('left', currentSequence);
      else if (e.key.toLowerCase() === 'p') handleIatClick('right', currentSequence);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [biasStep, iatTrialIndex, block1Sequence, block2Sequence]);

  useEffect(() => {
    if (biasStep === 'memory-intro') {
      const baseCards = [
        { pairId: 1, team: 'arancioni', job: 'Sentinella', icon: '🔭', img: IMG_ARANCIONE },
        { pairId: 2, team: 'arancioni', job: 'Esploratore', icon: '🗺️', img: IMG_ARANCIONE },
        { pairId: 3, team: 'arancioni', job: 'Ingegnere', icon: '🛠️', img: IMG_ARANCIONE },
        { pairId: 4, team: 'arancioni', job: 'Medico', icon: '🩺', img: IMG_ARANCIONE },
        { pairId: 5, team: 'arancioni', job: 'Cacciatore', icon: '🏹', img: IMG_ARANCIONE },
        { pairId: 6, team: 'ottanio', job: 'Raccoglitore', icon: '🧺', img: IMG_OTTANIO },
        { pairId: 7, team: 'ottanio', job: 'Meccanico', icon: '⚙️', img: IMG_OTTANIO },
        { pairId: 8, team: 'ottanio', job: 'Chimico', icon: '🧪', img: IMG_OTTANIO },
        { pairId: 9, team: 'ottanio', job: 'Cuoco', icon: '🍲', img: IMG_OTTANIO },
        { pairId: 10, team: 'ottanio', job: 'Sarto', icon: '🧵', img: IMG_OTTANIO },
      ] as const;

      const deck = [...baseCards, ...baseCards]
        .sort(() => Math.random() - 0.5)
        .map((card, index) => ({ ...card, uniqueId: index }));

      setCards(deck);
      setFlippedIndices([]);
      setMatchedPairs([]);
      setIngroupErrors(0);
      setOutgroupErrors(0);
    }
  }, [biasStep]);

  const handleCardClick = (index: number) => {
    if (isLocked || flippedIndices.includes(index) || matchedPairs.includes(cards[index].pairId)) return;
    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    if (newFlipped.length === 2) {
      setIsLocked(true);
      const card1 = cards[newFlipped[0]];
      const card2 = cards[newFlipped[1]];

      if (card1.pairId === card2.pairId) {
        setMatchedPairs(prev => [...prev, card1.pairId]);
        setFlippedIndices([]);
        setIsLocked(false);
        if (matchedPairs.length + 1 === 10) setTimeout(() => setBiasStep('memory-feedback'), 1000);
      } else {
        if (card1.team === team || card2.team === team) setIngroupErrors(prev => prev + 1);
        else setOutgroupErrors(prev => prev + 1);
        setTimeout(() => {
          setFlippedIndices([]);
          setIsLocked(false);
        }, 1200);
      }
    }
  };

  // MOTORE DI CADUTA PIOGGIA (120 SECONDI)
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;
    let spawnId: ReturnType<typeof setInterval>;
    let fallId: ReturnType<typeof setInterval>;

    if (biasStep === 'gonogo-game') {
      setGonogoTimeLeft(120); 
      setGonogoScore(0);
      setFallingItems([]);

      intervalId = setInterval(() => {
        setGonogoTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(intervalId);
            clearInterval(spawnId);
            clearInterval(fallId);
            setBiasStep('gonogo-loading'); 
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      spawnId = setInterval(() => {
        setFallingItems(prev => {
          const next = [...prev];
          const rand = Math.random();
          let itemType: 'go' | 'sasso' | 'foglia' = 'go';
          let icon = '🍓';

          if (rand < 0.20) {
            itemType = 'sasso';
            icon = '🪨';
          } else if (rand < 0.40) {
            itemType = 'foglia';
            icon = '🍂';
          } else {
            itemType = 'go';
            icon = Math.random() < 0.5 ? '🍓' : '🦗';
          }
          
          const newItem: FallingItem = {
            id: Date.now(),
            type: itemType,
            icon: icon,
            x: Math.random() * 80 + 10,
            y: -10,
            dy: Math.random() * 1.5 + 1.8,
            rotation: Math.random() * 360,
          };
          return [...next, newItem];
        });
      }, 600); 

      fallId = setInterval(() => {
        setFallingItems(prev => {
          const next: FallingItem[] = [];
          let penaltyTriggered = false;

          for (let item of prev) {
            const newY = item.y + item.dy;
            if (newY >= 110) {
              if (item.type === 'sasso' || item.type === 'foglia') {
                penaltyTriggered = true;
              }
            } else {
              next.push({ ...item, y: newY, rotation: item.rotation + item.dy });
            }
          }

          if (penaltyTriggered) {
            setTimeout(() => {
              setGonogoScore(s => (s > 0 ? s - 1 : 0));
              setGonogoFlash('error');
              setTimeout(() => setGonogoFlash(null), 300);
            }, 0);
          }

          return next;
        });
      }, 50);
    }

    return () => {
      clearInterval(intervalId);
      clearInterval(spawnId);
      clearInterval(fallId);
    };
  }, [biasStep]);

  // GESTIONE TASTI P (Sasso) e Q (Foglia)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (biasStep !== 'gonogo-game') return;
      const key = e.key.toLowerCase();
      
      if (key === 'p' || key === 'q') {
        e.preventDefault();
        const targetType = key === 'p' ? 'sasso' : 'foglia';

        setFallingItems(prev => {
          const targetIndex = prev.findIndex(item => item.type === targetType);
          
          if (targetIndex !== -1) {
            setTimeout(() => {
              setGonogoScore(s => s + 1);
              setGonogoFlash('success');
              setTimeout(() => setGonogoFlash(null), 300);
            }, 0);
            
            const next = [...prev];
            next.splice(targetIndex, 1);
            return next;
          } else {
            setTimeout(() => {
              setGonogoScore(s => (s > 0 ? s - 1 : 0));
              setGonogoFlash('error');
              setTimeout(() => setGonogoFlash(null), 300);
            }, 0);
            return prev;
          }
        });
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [biasStep]);

  useEffect(() => {
    if (biasStep === 'gonogo-loading') {
      setGonogoLoadingReady(false);
      const timer = setTimeout(() => setGonogoLoadingReady(true), 5000); 
      return () => clearTimeout(timer);
    }
  }, [biasStep]);

  const getClueForPc = (num: number | null, maxPcs: number) => {
    if (!num) return { logicalOrder: 0, text: "NESSUN DATO", isOrange: true };
    const scattered = getScatteredChunks(maxPcs);
    const chunk = scattered[num - 1]; 
    
    return { 
      logicalOrder: chunk.logicalOrder, 
      text: chunk.text, 
      isOrange: num % 2 !== 0 
    };
  };

  const handleSelectPc = (num: number) => {
    setPcNumber(num);
    setTeam(num % 2 !== 0 ? 'arancioni' : 'ottanio'); 
    setSortingStep('instructions'); 
    setConformityStep('question');
    setBiasStep('story');
    setCurrentPhase('cover-image');
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 relative">
      
      {currentPhase !== 'select-pc' && currentPhase !== 'cover-image' && (
        <header className="p-4 bg-white shadow-md flex justify-between items-center border-b-4 border-slate-200">
          <h1 className="text-xl font-bold text-slate-700">L'Accademia dei Suricati</h1>
          {team && (
            <div className={`px-4 py-2 rounded-full font-bold text-white shadow-sm ${team === 'arancioni' ? 'bg-orange-500' : 'bg-teal-600'}`}>
              PC {pcNumber} di {totalPcs} - Clan {team === 'arancioni' ? 'Arancione' : 'Ottanio'}
            </div>
          )}
        </header>
      )}

      {/* NUOVA FASE: Immagine di Copertina a SCHERMO INTERO ASSOLUTO */}
      {currentPhase === 'cover-image' && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-500">
          <img 
            src={asset('img/artcraft_2026-10-24-17-36-18.png')} 
            alt="Presentazione L'Accademia dei Suricati" 
            className="w-full h-full object-contain"
          />
          <button 
            onClick={() => setCurrentPhase('intro')} 
            className={`absolute bottom-12 px-16 py-6 text-white font-black rounded-full text-3xl uppercase tracking-widest shadow-2xl transition-transform hover:scale-105 border-4 border-white/20 hover:border-white/50 ${team === 'arancioni' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-teal-500 hover:bg-teal-600'}`}
          >
            Prosegui
          </button>
        </div>
      )}

      <main className="p-8 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[80vh]">
        
        {currentPhase === 'select-pc' && (
          <div className="text-center w-full max-w-2xl mx-auto animate-in fade-in">
            <div className="bg-white p-8 rounded-[3rem] shadow-xl border-4 border-slate-100 mb-12">
              <h2 className="text-2xl font-bold text-slate-400 mb-6 uppercase tracking-widest">1. Impostazioni Iniziali</h2>
              <div className="flex flex-col items-center justify-center gap-4">
                <label className="font-bold text-slate-700 text-2xl">Quanti PC giocano in questo turno?</label>
                <select 
                  value={totalPcs} 
                  onChange={(e) => setTotalPcs(Number(e.target.value))}
                  className="text-3xl font-black bg-cyan-50 border-4 border-cyan-200 rounded-2xl px-8 py-4 outline-none focus:border-cyan-500 text-cyan-700 cursor-pointer hover:bg-cyan-100 transition-colors"
                >
                  {Array.from({ length: 21 }, (_, i) => i + 10).map(n => (
                    <option key={n} value={n}>{n} Bambini (PC)</option>
                  ))}
                </select>
                <p className="text-sm text-slate-500 font-medium mt-2 max-w-sm">
                  I frammenti della password verranno distribuiti in modo sparpagliato per la classe.
                </p>
              </div>
            </div>

            <h2 className="text-3xl font-extrabold mb-8 text-slate-700">2. Seleziona la tua postazione</h2>
            <div className="grid grid-cols-5 gap-4">
              {Array.from({ length: totalPcs }, (_, i) => i + 1).map((num) => (
                <button
                  key={num}
                  onClick={() => handleSelectPc(num)}
                  className={`p-4 text-xl font-bold rounded-xl transition-transform hover:scale-105 shadow-sm text-white
                    ${num % 2 !== 0 ? 'bg-orange-500 hover:bg-orange-600' : 'bg-teal-500 hover:bg-teal-600'}`}
                >
                  PC {num}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentPhase === 'intro' && (
          <div className="relative w-full max-w-4xl mx-auto rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white/80 p-12 flex flex-col items-center justify-center space-y-10 animate-in zoom-in-95 duration-700 bg-gradient-to-br from-amber-300 via-orange-400 to-orange-500">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"></div>
            <div className="relative z-10 w-56 h-56 bg-white/90 backdrop-blur-md rounded-full shadow-[0_0_50px_rgba(255,255,255,0.4)] border-[12px] border-white flex items-center justify-center transform hover:rotate-3 hover:scale-105 transition-all duration-500">
              <span className="text-8xl drop-shadow-md animate-bounce">🏜️</span>
            </div>
            <div className="relative z-10 text-center space-y-6 max-w-2xl">
              <h2 className="text-6xl font-black text-white uppercase tracking-wider" style={{ textShadow: '0 8px 16px rgba(0,0,0,0.6)' }}>
                L'Oasi dell'Acqua
              </h2>
              <div className="bg-white/90 backdrop-blur-md px-8 py-4 rounded-3xl shadow-lg border border-white/50 text-slate-900">
                <p className="text-2xl font-extrabold leading-snug">Il deserto è in pericolo. <br/>La sopravvivenza dei suricati dipende da voi!</p>
              </div>
            </div>
            <button onClick={() => setCurrentPhase('phase-1')} className={`relative z-10 mt-8 px-14 py-6 text-white font-black rounded-full text-3xl uppercase tracking-widest transition-all hover:brightness-110 active:translate-y-2 active:border-b-0 ${team === 'arancioni' ? 'bg-orange-500 border-b-[8px] border-orange-700' : 'bg-teal-500 border-b-[8px] border-teal-700'}`}>
              INIZIA LA MISSIONE!
            </button>
          </div>
        )}

        {currentPhase === 'phase-1' && (
          <div className="w-full max-w-3xl mx-auto">
            {sortingStep === 'instructions' && (
              <div className="bg-white p-12 rounded-[2rem] shadow-xl text-center space-y-8 animate-in fade-in">
                <div className="text-6xl mb-4">👀</div>
                <h2 className="text-4xl font-black text-slate-700">Test della Vista del Suricato</h2>
                <p className="text-2xl text-slate-600 leading-relaxed">I suricati hanno una vista eccezionale. <br/>Nella prossima schermata ti verrà mostrata un'immagine per <strong>10 secondi</strong>. Cerca di capire quanti insetti ci sono!</p>
                <button onClick={() => setSortingStep('image')} className="mt-8 px-10 py-5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full text-2xl shadow-lg">Sono pronto!</button>
              </div>
            )}
            {sortingStep === 'image' && (
              <div className="bg-white p-10 rounded-[2rem] shadow-xl text-center space-y-8 animate-in zoom-in duration-300">
                <h2 className="text-3xl font-bold text-slate-700">Osserva attentamente...</h2>
                <div className="w-80 h-80 mx-auto bg-amber-100 rounded-3xl border-8 border-amber-300 relative flex items-center justify-center overflow-hidden">
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div key={i} className="absolute w-2 h-2 bg-slate-800 rounded-full" style={{ top: `${Math.random() * 80 + 10}%`, left: `${Math.random() * 80 + 10}%` }}></div>
                  ))}
                  <p className="text-amber-900/30 font-bold text-8xl rotate-12 z-0">🌿</p>
                </div>
                <div className="flex items-center justify-center space-x-4">
                  <div className="text-xl font-bold text-slate-500">Tempo rimasto:</div>
                  <div className={`text-5xl font-black ${timeLeft <= 3 ? 'text-red-500 animate-bounce' : 'text-slate-700'}`}>{timeLeft}</div>
                </div>
              </div>
            )}
            {sortingStep === 'choice' && (
              <div className="bg-white p-12 rounded-[2rem] shadow-xl text-center space-y-10 animate-in slide-in-from-bottom-8 duration-500">
                <h2 className="text-4xl font-black text-slate-700">Tempo scaduto!</h2>
                <p className="text-3xl text-slate-600 font-medium">Secondo te, c'erano...</p>
                <div className="flex gap-6 justify-center">
                  <button onClick={() => { setSortingStep('loading'); setTimeout(() => setSortingStep('result'), 2500); }} className="flex-1 px-8 py-10 bg-slate-100 hover:bg-amber-100 border-4 border-slate-200 text-slate-700 font-black rounded-3xl text-3xl">MENO di 17</button>
                  <button onClick={() => { setSortingStep('loading'); setTimeout(() => setSortingStep('result'), 2500); }} className="flex-1 px-8 py-10 bg-slate-100 hover:bg-amber-100 border-4 border-slate-200 text-slate-700 font-black rounded-3xl text-3xl">PIÙ di 17</button>
                </div>
              </div>
            )}
            {sortingStep === 'loading' && (
              <div className="text-center space-y-6 animate-pulse mt-20">
                <div className="w-24 h-24 border-8 border-slate-300 border-t-amber-500 rounded-full animate-spin mx-auto"></div>
                <h2 className="text-3xl font-bold text-slate-700">I saggi stanno analizzando...</h2>
              </div>
            )}
            {sortingStep === 'result' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 border-t-[12px] animate-in zoom-in duration-500" style={{ borderColor: team === 'arancioni' ? '#f97316' : '#0d9488' }}>
                <h2 className="text-3xl font-bold text-slate-500 uppercase">Sei stato assegnato ai</h2>
                <h1 className={`text-6xl font-black uppercase ${team === 'arancioni' ? 'text-orange-500' : 'text-teal-600'}`}>Suricati {team === 'arancioni' ? 'Arancioni' : 'Ottanio'}</h1>
                <div className="bg-slate-100 p-8 rounded-3xl mt-8 border-2 border-slate-200">
                  <p className="text-3xl mb-4">✋</p>
                  <p className="text-2xl font-bold text-slate-700">Alza la mano per il distintivo!</p>
                </div>
                <button onClick={() => setCurrentPhase('phase-2')} className={`mt-8 px-10 py-5 text-white font-bold rounded-full text-2xl shadow-lg ${team === 'arancioni' ? 'bg-orange-500' : 'bg-teal-500'}`}>Andiamo avanti!</button>
              </div>
            )}
          </div>
        )}

        {currentPhase === 'phase-2' && (
          <div className="w-full max-w-4xl mx-auto">
            {conformityStep === 'question' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-10 border-4 animate-in slide-in-from-right-8 duration-500" style={{ borderColor: team === 'arancioni' ? '#fdba74' : '#5eead4' }}>
                <h2 className="text-4xl font-black text-slate-700">Le tradizioni del tuo Clan</h2>
                <div className="bg-slate-50 p-8 rounded-3xl border border-slate-200">
                  <p className="text-2xl text-slate-700">
                    {team === 'arancioni' 
                      ? "Ben 9 suricati su 10 nel tuo clan preferiscono il Fico d'India 🍅​ al posto della Bacca Dolce 🫐." 
                      : "Ben 9 suricati su 10 nel tuo clan preferiscono la Bacca Dolce 🫐 al posto del Fico d'India 🍅​."}
                  </p>
                </div>
                <h3 className="text-3xl font-bold text-slate-600 mb-8">E tu, quale preferisci?</h3>
                <div className="flex gap-6 justify-center">
                  <button onClick={() => { setConformed(team === 'ottanio'); setConformityStep('feedback'); }} className="flex-1 flex flex-col items-center p-8 bg-white border-4 hover:border-amber-400 rounded-3xl group">
                    <span className="text-7xl mb-4 group-hover:scale-110">🫐</span>
                    <span className="text-2xl font-bold">Bacca Dolce</span>
                  </button>
                  <button onClick={() => { setConformed(team === 'arancioni'); setConformityStep('feedback'); }} className="flex-1 flex flex-col items-center p-8 bg-white border-4 hover:border-amber-400 rounded-3xl group">
                    <span className="text-7xl mb-4 group-hover:scale-110">🍅​</span>
                    <span className="text-2xl font-bold">Fico d'India</span>
                  </button>
                </div>
              </div>
            )}
            {conformityStep === 'feedback' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in zoom-in duration-300">
                <div className="text-7xl mb-6">{conformed ? '🎉' : '⭐'}</div>
                <h2 className="text-4xl font-black text-slate-700">Scelta registrata!</h2>
                <p className="text-2xl text-slate-600">
                  {conformed ? "Ottima scelta! Sei in perfetta sintonia con il gruppo." : "Scelta originale! A volte i suricati hanno gusti diversi."}
                </p>
                <button onClick={() => setCurrentPhase('phase-3')} className={`mt-10 px-10 py-5 text-white font-bold rounded-full text-2xl ${team === 'arancioni' ? 'bg-orange-500' : 'bg-teal-500'}`}>Continua l'esplorazione</button>
              </div>
            )}
          </div>
        )}

        {currentPhase === 'phase-3' && (
          <div className="w-full max-w-5xl mx-auto">
            {biasStep === 'story' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in fade-in duration-500">
                <div className="text-7xl mb-4 animate-bounce">🚨</div>
                <h2 className="text-4xl font-black text-slate-700 uppercase tracking-wide">L'Oasi Contesa</h2>
                <div className="bg-amber-50 p-8 rounded-3xl border-2 border-amber-200">
                  <p className="text-2xl text-slate-700 leading-relaxed font-medium">Oscar avvisa: <strong className="text-red-500">è iniziata la stagione secca</strong>. <br/>Nel deserto è rimasta una sola oasi sicura. Entrambi i clan l'hanno scoperta, ma le risorse non basteranno per tutti.</p>
                </div>
                <button onClick={() => setBiasStep('preference')} className={`mt-8 px-12 py-5 text-white font-black rounded-full text-2xl shadow-lg ${team === 'arancioni' ? 'bg-orange-500' : 'bg-teal-500'}`}>Continua</button>
              </div>
            )}
            {biasStep === 'preference' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-10 animate-in slide-in-from-right duration-500">
                <h2 className="text-4xl font-black text-slate-700">Sii sincero...</h2>
                <p className="text-3xl text-slate-600 font-medium">Chi <strong>preferiresti</strong> vincesse la sfida?</p>
                <div className="flex gap-6 justify-center mt-8">
                  <button onClick={() => { setPreferredWinner('arancioni'); setBiasStep('prediction'); }} className="flex-1 px-8 py-12 bg-orange-50 border-4 border-orange-200 hover:border-orange-500 text-orange-600 font-black rounded-3xl text-3xl">Gli Arancioni</button>
                  <button onClick={() => { setPreferredWinner('ottanio'); setBiasStep('prediction'); }} className="flex-1 px-8 py-12 bg-teal-50 border-4 border-teal-200 hover:border-teal-500 text-teal-700 font-black rounded-3xl text-3xl">Gli Ottanio</button>
                </div>
              </div>
            )}
            {biasStep === 'prediction' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-10 animate-in slide-in-from-right duration-500">
                <h2 className="text-4xl font-black text-slate-700">Un'ultima domanda!</h2>
                <p className="text-3xl text-slate-600 font-medium">E secondo te, chi <strong>vincerà davvero</strong>?</p>
                <div className="flex gap-6 justify-center mt-8">
                  <button onClick={() => { setPredictedWinner('arancioni'); setBiasStep('iat-intro'); }} className="flex-1 px-8 py-12 bg-orange-50 border-4 border-orange-200 hover:border-orange-500 text-orange-600 font-black rounded-3xl text-3xl">Vinceranno gli Arancioni</button>
                  <button onClick={() => { setPredictedWinner('ottanio'); setBiasStep('iat-intro'); }} className="flex-1 px-8 py-12 bg-teal-50 border-4 border-teal-200 hover:border-teal-500 text-teal-700 font-black rounded-3xl text-3xl">Vinceranno gli Ottanio</button>
                </div>
              </div>
            )}

            {biasStep === 'iat-intro' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in fade-in">
                <div className="text-6xl mb-4 animate-bounce">⚡</div>
                <h2 className="text-4xl font-black text-slate-700">Allenamento di Velocità</h2>
                <p className="text-2xl text-slate-600">Per vincere l'oasi servono riflessi pronti! Ti mostreremo delle immagini al centro dello schermo. <br/><br/>Il tuo compito è <strong>cliccare il più velocemente possibile</strong> sul lato corretto a cui appartengono usando il mouse oppure i tasti <strong>Q</strong> e <strong>P</strong> della tastiera.</p>
                <button onClick={() => setBiasStep('iat-block1')} className="mt-8 px-10 py-5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full text-2xl shadow-lg">Inizia Blocco 1</button>
              </div>
            )}

            {(biasStep === 'iat-block1' || biasStep === 'iat-block2') && (
              <div className={`fixed inset-0 z-50 flex flex-col justify-between p-8 sm:p-12 ${iatError ? 'bg-red-950' : 'bg-black'} transition-colors duration-150`}>
                <div className="flex justify-between items-start w-full max-w-6xl mx-auto text-white">
                  <div className="text-left w-1/3">
                    <p className="text-2xl font-black uppercase tracking-widest text-slate-400 mb-2">Sinistra (Premi Q)</p>
                    <p className="text-4xl font-bold leading-tight text-white">Suricati {ingroupName} <br/> <span className={biasStep === 'iat-block1' ? 'text-green-400' : 'text-blue-400'}>{biasStep === 'iat-block1' ? 'OPPURE Felice 😊' : 'OPPURE Triste ☹️'}</span></p>
                  </div>
                  <div className="text-center opacity-50 mt-4"><span className="px-4 py-2 border-2 border-white rounded-full font-bold uppercase tracking-widest text-sm">Sii Veloce!</span></div>
                  <div className="text-right w-1/3">
                    <p className="text-2xl font-black uppercase tracking-widest text-slate-400 mb-2">Destra (Premi P)</p>
                    <p className="text-4xl font-bold leading-tight text-white">Suricati {outgroupName} <br/> <span className={biasStep === 'iat-block1' ? 'text-blue-400' : 'text-green-400'}>{biasStep === 'iat-block1' ? 'OPPURE Triste ☹️' : 'OPPURE Felice 😊'}</span></p>
                  </div>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center relative">
                  {(biasStep === 'iat-block1' ? block1Sequence[iatTrialIndex].type : block2Sequence[iatTrialIndex].type) === 'text' ? (
                    <div className="text-7xl font-black text-white px-16 py-10 bg-slate-800 rounded-[3rem] shadow-2xl border-4 border-slate-700">{biasStep === 'iat-block1' ? block1Sequence[iatTrialIndex].content : block2Sequence[iatTrialIndex].content}</div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <img src={(biasStep === 'iat-block1' ? block1Sequence[iatTrialIndex].content : block2Sequence[iatTrialIndex].content) === 'Arancioni' ? IMG_ARANCIONE : IMG_OTTANIO} alt="Suricato" className="w-80 h-80 object-cover bg-slate-800 rounded-[3rem] shadow-2xl border-8 border-slate-600" />
                      <p className="text-white text-3xl font-bold mt-6 opacity-50 uppercase tracking-widest">Suricati {(biasStep === 'iat-block1' ? block1Sequence[iatTrialIndex].content : block2Sequence[iatTrialIndex].content)}</p>
                    </div>
                  )}
                  {iatError && <div className="absolute top-[80%] text-red-500 text-9xl font-black animate-ping drop-shadow-2xl">X</div>}
                </div>
                <div className="flex justify-between gap-8 w-full max-w-5xl mx-auto">
                  <button onClick={() => handleIatClick('left', biasStep === 'iat-block1' ? block1Sequence : block2Sequence)} className="flex-1 py-10 bg-slate-800 hover:bg-slate-700 text-white border-4 border-slate-600 rounded-[2rem] text-4xl font-black shadow-lg transition-transform active:scale-95">[Q] 👈 SINISTRA</button>
                  <button onClick={() => handleIatClick('right', biasStep === 'iat-block1' ? block1Sequence : block2Sequence)} className="flex-1 py-10 bg-slate-800 hover:bg-slate-700 text-white border-4 border-slate-600 rounded-[2rem] text-4xl font-black shadow-lg transition-transform active:scale-95">DESTRA 👉 [P]</button>
                </div>
              </div>
            )}

            {biasStep === 'iat-interlude' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in zoom-in">
                <h2 className="text-4xl font-black text-slate-700">Ottimo lavoro!</h2>
                <p className="text-2xl text-slate-600">Ora le regole si invertono. Fai molta attenzione!</p>
                <button onClick={() => setBiasStep('iat-block2')} className="mt-8 px-10 py-5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-full text-2xl shadow-lg">Inizia Blocco 2</button>
              </div>
            )}

            {biasStep === 'iat-feedback' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-10 animate-in slide-in-from-bottom">
                <h2 className="text-4xl font-black text-slate-700">Fine dell'Allenamento!</h2>
                <p className="text-2xl text-slate-600 font-medium">Una curiosità: quale dei due blocchi ti è sembrato più <strong>facile e veloce</strong> da completare?</p>
                <div className="flex flex-col gap-4 mt-8 max-w-2xl mx-auto">
                  <button onClick={() => { setIatDifficultyChoice('ingroup-happy'); setBiasStep('memory-intro'); }} className="p-6 bg-slate-50 border-4 border-slate-200 hover:border-amber-400 text-slate-700 font-bold rounded-2xl text-xl text-left transition-transform hover:-translate-y-1 shadow-sm">Quando dovevo associare i Suricati {ingroupName} alle faccine FELICI 😊</button>
                  <button onClick={() => { setIatDifficultyChoice('ingroup-sad'); setBiasStep('memory-intro'); }} className="p-6 bg-slate-50 border-4 border-slate-200 hover:border-amber-400 text-slate-700 font-bold rounded-2xl text-xl text-left transition-transform hover:-translate-y-1 shadow-sm">Quando dovevo associare i Suricati {ingroupName} alle faccine TRISTI ☹️</button>
                  <button onClick={() => { setIatDifficultyChoice('uguale'); setBiasStep('memory-intro'); }} className="p-6 bg-slate-50 border-4 border-slate-200 hover:border-amber-400 text-slate-700 font-bold rounded-2xl text-xl text-center transition-transform hover:-translate-y-1 shadow-sm">Erano facili uguali</button>
                </div>
              </div>
            )}

            {biasStep === 'memory-intro' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in fade-in duration-500">
                <div className="text-6xl mb-4 animate-pulse">🧠</div>
                <h2 className="text-4xl font-black text-slate-700 uppercase tracking-wide">Test di Memoria!</h2>
                <p className="text-2xl text-slate-600 leading-relaxed font-medium">
                  Trova le 10 coppie! Le carte nascondono membri di entrambi i clan, ognuno con il suo mestiere. <br/>
                  Vediamo in quanto tempo riesci a scoprire tutti i suricati.
                </p>
                <button onClick={() => setBiasStep('memory-game')} className={`mt-8 px-12 py-5 text-white font-black rounded-full text-2xl shadow-lg ${team === 'arancioni' ? 'bg-orange-500' : 'bg-teal-500'}`}>Inizia il Memory</button>
              </div>
            )}

            {biasStep === 'memory-game' && (
              <div className="bg-white p-8 sm:p-12 rounded-[3rem] shadow-2xl text-center animate-in zoom-in w-full">
                <h2 className="text-3xl font-bold text-slate-700 mb-8">Trova le 10 coppie</h2>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 sm:gap-4">
                  {cards.map((card, index) => {
                    const isFlipped = flippedIndices.includes(index) || matchedPairs.includes(card.pairId);
                    return (
                      <button 
                        key={card.uniqueId} 
                        onClick={() => handleCardClick(index)}
                        className={`h-28 sm:h-32 rounded-2xl transition-all duration-300 transform perspective-1000 ${isFlipped ? 'rotate-y-180' : 'hover:-translate-y-1 hover:shadow-lg'}`}
                        style={{ perspective: '1000px' }}
                      >
                        <div className={`relative w-full h-full transition-transform duration-500 ${isFlipped ? 'rotate-y-180' : ''}`} style={{ transformStyle: 'preserve-3d' }}>
                          <div className={`absolute inset-0 bg-slate-200 border-4 border-slate-300 rounded-2xl flex items-center justify-center shadow-inner ${isFlipped ? 'opacity-0' : 'opacity-100'}`} style={{ backfaceVisibility: 'hidden' }}><span className="text-4xl opacity-30">❓</span></div>
                          <div className={`absolute inset-0 rounded-2xl border-4 flex flex-col items-center justify-center p-1 sm:p-2 bg-white ${card.team === 'arancioni' ? 'border-orange-300' : 'border-teal-300'} ${isFlipped ? 'opacity-100' : 'opacity-0'}`} style={{ transform: 'rotateY(180deg)', backfaceVisibility: 'hidden' }}>
                            <img src={card.img} alt="Suricato" className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded-full mb-1" />
                            <span className="text-2xl absolute top-1 right-1 sm:top-2 sm:right-2">{card.icon}</span>
                            <span className="text-[10px] sm:text-xs font-bold text-slate-700 mt-1 uppercase tracking-wider">{card.job}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {biasStep === 'memory-feedback' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in zoom-in">
                <div className="text-7xl mb-4">💡</div>
                <h2 className="text-4xl font-black text-slate-700">Tutte le coppie trovate!</h2>
                <div className="grid grid-cols-2 gap-8 mt-8">
                  <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-200">
                    <p className="text-lg text-slate-500 font-bold uppercase mb-2">Errori con il tuo clan</p>
                    <p className="text-5xl font-black text-slate-700">{ingroupErrors}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-200">
                    <p className="text-lg text-slate-500 font-bold uppercase mb-2">Errori con l'altro clan</p>
                    <p className="text-5xl font-black text-slate-700">{outgroupErrors}</p>
                  </div>
                </div>
                <div className="bg-amber-50 p-8 rounded-3xl border-2 border-amber-200 mt-8">
                  <p className="text-2xl text-slate-700 leading-relaxed font-medium">
                    Lo sapevi? Spesso notiamo meglio i dettagli dei membri del <strong>nostro gruppo</strong> e troviamo le loro coppie con meno errori, mentre tendiamo a confondere quelli degli altri gruppi pensando che "siano tutti uguali".
                  </p>
                </div>
                <button onClick={() => setBiasStep('gonogo-intro')} className={`mt-8 px-12 py-5 text-white font-black rounded-full text-2xl shadow-lg ${team === 'arancioni' ? 'bg-orange-500' : 'bg-teal-500'}`}>
                  E adesso... alla Caccia!
                </button>
              </div>
            )}

            {biasStep === 'gonogo-intro' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in fade-in duration-500">
                <div className="text-7xl mb-4 animate-bounce">🌪️</div>
                <h2 className="text-4xl font-black text-slate-700 uppercase tracking-wide">Proteggi le Provviste! (2 Minuti)</h2>
                <div className="bg-amber-50 p-8 rounded-3xl border-2 border-amber-200 text-left space-y-6">
                  <p className="text-2xl text-slate-700 font-medium text-center border-b-2 border-amber-200 pb-4">
                    Il vento fa cadere detriti e cibo dal cielo per 2 minuti interi. Reagisci subito!
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-6 rounded-2xl border-2 border-red-300 text-center shadow-sm">
                      <p className="text-4xl mb-2">🪨</p>
                      <p className="text-lg font-bold text-slate-700">Premi il tasto</p>
                      <span className="text-3xl font-black text-red-600">P</span>
                    </div>
                    <div className="bg-white p-6 rounded-2xl border-2 border-amber-300 text-center shadow-sm">
                      <p className="text-4xl mb-2">🍂</p>
                      <p className="text-lg font-bold text-slate-700">Premi il tasto</p>
                      <span className="text-3xl font-black text-amber-600">Q</span>
                    </div>
                  </div>
                  <p className="text-xl text-slate-700 text-center mt-2">
                    ❌ <strong>NON PREMERE NULLA</strong> per le provviste buone (<span className="text-green-600 font-bold">🍓 🦗</span>) che devono atterrare in salvo!
                  </p>
                </div>
                <button onClick={() => setBiasStep('gonogo-game')} className={`mt-8 px-12 py-5 text-white font-black rounded-full text-2xl shadow-lg ${team === 'arancioni' ? 'bg-orange-500' : 'bg-teal-500'}`}>
                  Sono Pronto!
                </button>
              </div>
            )}

            {biasStep === 'gonogo-game' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center w-full max-w-4xl mx-auto flex flex-col items-center justify-between min-h-[600px] relative overflow-hidden">
                {gonogoFlash === 'success' && <div className="absolute inset-0 bg-green-200 opacity-50 z-0 animate-pulse"></div>}
                {gonogoFlash === 'error' && <div className="absolute inset-0 bg-red-300 opacity-50 z-0 animate-pulse"></div>}
                
                <div className="w-full flex justify-between items-center relative z-10 px-8 mb-4">
                  <div className="bg-slate-100 px-6 py-3 rounded-2xl border-4 border-slate-200">
                    <p className="text-sm font-black text-slate-400 uppercase">Tempo</p>
                    <p className={`text-4xl font-black ${gonogoTimeLeft <= 15 ? 'text-red-500 animate-bounce' : 'text-slate-700'}`}>
                      {Math.floor(gonogoTimeLeft / 60)}:{String(gonogoTimeLeft % 60).padStart(2, '0')}
                    </p>
                  </div>
                  <div className="bg-slate-100 px-6 py-3 rounded-2xl border-4 border-slate-200">
                    <p className="text-sm font-black text-slate-400 uppercase">Punteggio</p>
                    <p className="text-4xl font-black text-amber-500">{gonogoScore}</p>
                  </div>
                </div>

                <div className="flex-1 w-full relative z-10 bg-gradient-to-b from-blue-50 to-amber-50 rounded-3xl border-4 border-amber-200 overflow-hidden shadow-inner">
                  {fallingItems.map(item => (
                    <div 
                      key={item.id} 
                      className="absolute text-6xl transition-transform duration-75 ease-linear drop-shadow-md"
                      style={{ 
                        left: `${item.x}%`, 
                        top: `${item.y}%`,
                        transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`
                      }}
                    >
                      {item.icon}
                    </div>
                  ))}
                  
                  {fallingItems.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-3xl text-slate-300 font-black tracking-widest opacity-50">
                      PREPARATI...
                    </div>
                  )}
                  
                  <div className="absolute bottom-0 w-full h-8 bg-amber-800/20 border-t-4 border-amber-900/30"></div>
                </div>

                <div className="flex gap-8 mt-6 relative z-10">
                  <div className="bg-red-50 px-6 py-2 rounded-xl border-2 border-red-200 font-bold text-red-700">
                    🪨 Premi <span className="text-2xl font-black underline ml-1">P</span>
                  </div>
                  <div className="bg-amber-50 px-6 py-2 rounded-xl border-2 border-amber-200 font-bold text-amber-700">
                    🍂 Premi <span className="text-2xl font-black underline ml-1">Q</span>
                  </div>
                </div>
              </div>
            )}

            {biasStep === 'gonogo-loading' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-10 animate-in fade-in duration-500 w-full max-w-3xl mx-auto mt-10">
                {!gonogoLoadingReady ? (
                  <>
                    <div className="w-32 h-32 border-[12px] border-slate-100 border-t-amber-500 rounded-full animate-spin mx-auto"></div>
                    <h2 className="text-4xl font-black text-slate-700">Sincronizzazione in corso...</h2>
                    <p className="text-2xl text-slate-500 font-medium">I saggi stanno calcolando tutte le provviste raccolte. <br/><br/><strong>Attendi gli altri compagni!</strong></p>
                  </>
                ) : (
                  <>
                    <div className="text-7xl mb-4 animate-bounce">✅</div>
                    <h2 className="text-4xl font-black text-slate-700">Tutti hanno finito!</h2>
                    <p className="text-2xl text-slate-500 font-medium">I risultati sono pronti.</p>
                    <button onClick={() => setBiasStep('gonogo-result')} className={`mt-8 px-12 py-5 text-white font-black rounded-full text-2xl shadow-lg animate-in zoom-in ${team === 'arancioni' ? 'bg-orange-500 hover:bg-orange-600' : 'bg-teal-500 hover:bg-teal-600'}`}>Scopri il Vincitore</button>
                  </>
                )}
              </div>
            )}

            {biasStep === 'gonogo-result' && (
              <div className="bg-white p-12 rounded-[3rem] shadow-2xl text-center space-y-8 animate-in zoom-in duration-700">
                <div className="text-7xl mb-4 animate-spin-slow">⏳</div>
                <h2 className="text-5xl font-black text-slate-700 uppercase text-red-500">Tempo Scaduto!</h2>
                <div className="bg-slate-100 p-8 rounded-3xl border-4 border-slate-200 mt-8">
                  <p className="text-3xl text-slate-700 leading-relaxed font-bold">Incredibile... è un <span className="text-amber-500 font-black text-4xl">PAREGGIO ASSOLUTO!</span></p>
                  <p className="text-xl text-slate-600 mt-4">Sia gli Arancioni che gli Ottanio hanno raccolto esattamente lo stesso numero di provviste. La tensione è alle stelle!</p>
                </div>
                <button onClick={() => setCurrentPhase('phase-4')} className="mt-8 px-12 py-5 text-white font-black rounded-full text-2xl shadow-lg bg-red-600 hover:bg-red-500 animate-pulse">Mentre litigate per l'Oasi...</button>
              </div>
            )}

          </div>
        )}

        {/* FASE 4: L'Emergenza - SPARSI NELLA STANZA */}
        {currentPhase === 'phase-4' && (
          <div className="relative w-full max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[70vh] animate-in zoom-in duration-700">
            <div className="absolute inset-0 bg-red-900/10 animate-pulse rounded-[3rem] pointer-events-none blur-3xl"></div>
            <div className="relative z-10 w-full bg-[#fdf5e6] p-10 sm:p-16 shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-[16px] border-[#8b4513] rounded-sm transform rotate-1">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-amber-900/30 m-2"></div>
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-amber-900/30 m-2"></div>
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-amber-900/30 m-2"></div>
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-amber-900/30 m-2"></div>

              <div className="text-center space-y-8">
                <div className="text-6xl drop-shadow-md">📜</div>
                <h2 className="text-4xl font-serif font-black text-amber-950 uppercase tracking-widest border-b-2 border-amber-900/20 pb-4 inline-block">L'Antico Lucchetto</h2>
                <p className="text-xl text-amber-900 leading-relaxed font-serif italic max-w-3xl mx-auto">
                  "La competizione ha bloccato l'Oasi! Per far ripartire l'acqua dovete unire tutti i frammenti sparsi nella stanza. Solo insieme potrete leggere la <strong className="text-amber-950 font-black">Grande Password Finale!</strong>"
                </p>

                <div className="bg-amber-100/50 p-6 rounded-2xl border-2 border-amber-900/20 max-w-2xl mx-auto">
                  <p className="text-amber-950 font-black uppercase tracking-widest mb-2 flex justify-center items-center gap-2"><span className="text-2xl">🗣️</span> La Catena dei Suricati</p>
                  <p className="text-amber-900 font-medium">I frammenti sono stati mescolati e sparsi per l'aula! Chi ha il <strong>Pezzo N. 1</strong> inizia alzandosi in piedi e gridando la sua parola. Poi chi ha il N. 2 si alza e continua, e così via fino all'ultimo!</p>
                </div>

                <div className="mt-8 pt-4">
                  <p className="text-amber-800 font-bold uppercase tracking-widest mb-4">Il tuo Frammento (PC {pcNumber})</p>
                  <div className="flex justify-center">
                    <div className={`py-8 px-10 shadow-lg border-y-4 border-amber-900/40 relative max-w-2xl ${team === 'arancioni' ? 'bg-gradient-to-r from-orange-100 to-teal-50 border-l-8 border-l-orange-500 rounded-r-[4rem] rounded-l-md border-r-4 border-r-teal-500/50' : 'bg-gradient-to-l from-teal-100 to-orange-50 border-r-8 border-r-teal-600 rounded-l-[4rem] rounded-r-md border-l-4 border-l-orange-500/50'}`}>
                      <div className={`absolute top-1/2 -translate-y-1/2 text-2xl opacity-50 ${team === 'arancioni' ? '-right-4' : '-left-4'}`}>🧩</div>
                      <p className="text-xl font-bold text-amber-800/80 mb-2 uppercase tracking-widest">Pezzo N. {getClueForPc(pcNumber, totalPcs).logicalOrder}</p>
                      <p className="text-3xl sm:text-5xl font-mono font-black text-amber-950 tracking-widest drop-shadow-sm">{getClueForPc(pcNumber, totalPcs).text}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setCurrentPhase('phase-5')} className="relative z-10 mt-12 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-bold rounded-full transition-colors opacity-30 hover:opacity-100">
              [Moderatore] Frase Completata in Aula!
            </button>
          </div>
        )}

        {/* FASE 5: Debriefing */}
        {currentPhase === 'phase-5' && (
          <div className="relative w-full max-w-5xl mx-auto flex flex-col items-center justify-center min-h-[80vh] animate-in zoom-in duration-1000">
            <div className="absolute inset-0 bg-gradient-to-b from-cyan-400 to-blue-600 opacity-20 rounded-[3rem] pointer-events-none"></div>

            <div className="relative z-10 w-full bg-white/95 backdrop-blur-sm p-12 sm:p-20 shadow-2xl border-[12px] border-cyan-500/30 rounded-[3rem] text-center">
              
              <div className="flex justify-center mb-8">
                <div className="w-40 h-40 bg-cyan-100 rounded-full flex items-center justify-center border-8 border-cyan-300 shadow-lg relative">
                  <span className="text-7xl absolute z-10">🦦</span>
                  <span className="text-4xl absolute -bottom-2 -right-2 z-20">💧</span>
                </div>
              </div>

              <h2 className="text-5xl sm:text-6xl font-black text-cyan-700 uppercase tracking-widest mb-12 drop-shadow-sm">
                L'Oasi è Salva!
              </h2>
              
              <div className="bg-gradient-to-r from-orange-50 via-slate-50 to-teal-50 p-10 sm:p-14 rounded-[3rem] border-4 border-slate-200 shadow-xl">
                <p className="text-3xl sm:text-4xl font-serif font-black text-slate-800 leading-relaxed uppercase tracking-wide">
                  "{MASTER_WORDS.join(" ")}"
                </p>
              </div>

              <div className="mt-16 opacity-20 hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => {
                    setCurrentPhase('select-pc');
                    setTeam(null);
                    setPcNumber(null);
                  }}
                  className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-full uppercase tracking-widest transition-transform hover:scale-105"
                >
                  [Ricercatori] Avvia Nuovo Gruppo
                </button>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* ================= DEV MENU ================= */}
      <div className="fixed bottom-4 right-4 z-[100] bg-slate-900/90 p-4 rounded-2xl shadow-2xl flex flex-col gap-2 border border-slate-700 backdrop-blur-sm">
        <p className="text-white text-xs font-black uppercase text-center mb-1 tracking-widest text-slate-400">Pannello Sviluppo</p>
        <button onClick={() => { setCurrentPhase('select-pc'); setTeam(null); setPcNumber(null); }} className="text-xs px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-lg transition-colors">
          🔄 Inizio (Seleziona PC)
        </button>
        <button onClick={() => { setCurrentPhase('phase-3'); setTeam('arancioni'); setPcNumber(1); setBiasStep('iat-intro'); }} className="text-xs px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition-colors">
          ⚡ Salta allo IAT
        </button>
        <button onClick={() => { setCurrentPhase('phase-3'); setTeam('arancioni'); setPcNumber(1); setBiasStep('memory-intro'); }} className="text-xs px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white font-bold rounded-lg transition-colors">
          🧩 Salta al Memory
        </button>
        <button onClick={() => { setCurrentPhase('phase-3'); setTeam('arancioni'); setPcNumber(1); setBiasStep('gonogo-intro'); }} className="text-xs px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white font-bold rounded-lg transition-colors">
          🏃 Salta a Caccia
        </button>
        <button onClick={() => { setCurrentPhase('phase-4'); setTeam('arancioni'); setPcNumber(1); }} className="text-xs px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors">
          🚨 Salta a Emergenza
        </button>
      </div>
    </div>
  );
}