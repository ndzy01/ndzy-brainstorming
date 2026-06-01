import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import InterviewHistory from './pages/InterviewHistory';
import InterviewConfig from './pages/InterviewConfig';
import InterviewChat from './pages/InterviewChat';
import InterviewReport from './pages/InterviewReport';
import GameHistory from './pages/GameHistory';
import GameConfig from './pages/GameConfig';
import GameSession from './pages/GameSession';
import GameRecap from './pages/GameRecap';
import ToastContainer from './components/Toast';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/interview" element={<InterviewHistory />} />
        <Route path="/interview/config" element={<InterviewConfig />} />
        <Route path="/interview/:sessionId/chat" element={<InterviewChat />} />
        <Route path="/interview/:sessionId/report" element={<InterviewReport />} />
        <Route path="/game" element={<GameHistory />} />
        <Route path="/game/config" element={<GameConfig />} />
        <Route path="/game/:sessionId/play" element={<GameSession />} />
        <Route path="/game/:sessionId/recap" element={<GameRecap />} />
      </Routes>
      <ToastContainer />
    </div>
  );
}