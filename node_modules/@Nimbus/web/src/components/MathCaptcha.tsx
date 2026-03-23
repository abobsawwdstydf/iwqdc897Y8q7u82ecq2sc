import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface MathCaptchaProps {
  onSuccess: (answer: number) => void;
  onError?: () => void;
}

export default function MathCaptcha({ onSuccess, onError }: MathCaptchaProps) {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [answer, setAnswer] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState(false);

  const generateCaptcha = () => {
    const n1 = Math.floor(Math.random() * 10) + 1;
    const n2 = Math.floor(Math.random() * 10) + 1;
    setNum1(n1);
    setNum2(n2);
    setAnswer('');
    setError(false);
  };

  useEffect(() => {
    generateCaptcha();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correctAnswer = num1 + num2;
    
    if (parseInt(answer) === correctAnswer) {
      onSuccess(correctAnswer);
    } else {
      setError(true);
      setAttempts(prev => prev + 1);
      
      if (attempts >= 2) {
        generateCaptcha();
        setAttempts(0);
      }
      
      onError?.();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-xl bg-white/5 border border-white/10"
    >
      <p className="text-sm text-zinc-300 mb-3 font-medium">
        Подтвердите, что вы не робот:
      </p>
      
      <form onSubmit={handleSubmit} className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-white text-lg font-bold">
          <span>{num1}</span>
          <span>+</span>
          <span>{num2}</span>
          <span>=</span>
          <span>?</span>
        </div>
        
        <input
          type="number"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className={`w-20 px-3 py-2 rounded-lg bg-white/10 border text-white text-center font-bold outline-none transition-colors ${
            error ? 'border-red-500/50' : 'border-white/20 focus:border-Nimbus-500/50'
          }`}
          placeholder="?"
          autoFocus
        />
        
        <button
          type="submit"
          className="px-4 py-2 rounded-lg bg-Nimbus-500 hover:bg-Nimbus-600 text-white font-medium transition-colors"
        >
          OK
        </button>
      </form>
      
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-red-400 mt-2"
        >
          Неверно, попробуйте ещё раз
        </motion.p>
      )}
    </motion.div>
  );
}
