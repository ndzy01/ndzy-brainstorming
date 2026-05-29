import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Interview from './pages/Interview';
import Game from './pages/Game';
import ToastContainer from './components/Toast';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/interview" element={<Interview />} />
        <Route path="/game" element={<Game />} />
      </Routes>
      <ToastContainer />
    </div>
  );
}