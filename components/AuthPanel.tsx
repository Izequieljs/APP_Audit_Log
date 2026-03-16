import React, { useState } from 'react';
import { useAuth } from './AuthContext';

export const AuthPanel: React.FC = () => {
  const { login } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [step, setStep] = useState<'form' | 'verify'>('form');
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (isLogin) {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        login(data.token, data.user);
      } catch (err: any) {
        setError(err.message);
      }
    } else {
      if (step === 'form') {
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setMessage(data.message);
          if (data.devCode) {
            console.log("DEV VERIFICATION CODE:", data.devCode);
          }
          setStep('verify');
        } catch (err: any) {
          setError(err.message);
        }
      } else if (step === 'verify') {
        try {
          const res = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          setMessage('Conta verificada! Faça login para continuar.');
          setIsLogin(true);
          setStep('form');
        } catch (err: any) {
          setError(err.message);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
          {isLogin ? 'Entrar no Sistema' : (step === 'form' ? 'Criar Conta' : 'Verificar E-mail')}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && <div className="text-red-600 text-sm">{error}</div>}
            {message && <div className="text-emerald-600 text-sm">{message}</div>}

            {!isLogin && step === 'form' && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Nome</label>
                <div className="mt-1">
                  <input type="text" required value={name} onChange={e => setName(e.target.value)} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
              </div>
            )}

            {step === 'form' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700">E-mail Aeris</label>
                  <div className="mt-1">
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700">Senha</label>
                  <div className="mt-1">
                    <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                  </div>
                </div>
              </>
            )}

            {!isLogin && step === 'verify' && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Código de Acesso</label>
                <div className="mt-1">
                  <input type="text" required value={code} onChange={e => setCode(e.target.value)} className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm" />
                </div>
                <p className="mt-2 text-xs text-slate-500">Verifique seu e-mail para obter o código. (Em modo preview, o código é exibido no console do servidor).</p>
              </div>
            )}

            <div>
              <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500">
                {isLogin ? 'Entrar' : (step === 'form' ? 'Cadastrar' : 'Verificar')}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-slate-500">Ou</span>
              </div>
            </div>

            <div className="mt-6 text-center">
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setStep('form');
                  setError('');
                  setMessage('');
                }}
                className="text-emerald-600 hover:text-emerald-500 font-medium"
              >
                {isLogin ? 'Criar uma nova conta' : 'Já tenho uma conta'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
