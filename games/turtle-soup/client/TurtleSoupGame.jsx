import { useState, useEffect, useRef, useCallback } from 'react';
import { playSound } from '../../../client/src/services/sounds';

// 花色颜色
const CATEGORY_COLORS = {
  mystery: { bg: '#8e44ad', light: '#d2b4de', text: '#4a235a' },
  horror: { bg: '#c0392b', light: '#f5b7b1', text: '#641e16' },
  humor: { bg: '#e67e22', light: '#fdebd0', text: '#784212' },
  heartwarming: { bg: '#e91e63', light: '#fce4ec', text: '#880e4f' },
  mindblown: { bg: '#00bcd4', light: '#b2ebf2', text: '#006064' },
};

const ANSWER_COLORS = {
  '\u662f': { bg: '#27ae60', icon: '\u2705' },
  '\u4e0d\u662f': { bg: '#e74c3c', icon: '\u274c' },
  '\u662f\u4e5f\u4e0d\u662f': { bg: '#f39c12', icon: '\u26a0\ufe0f' },
  '\u4e0d\u76f8\u5173': { bg: '#95a5a6', icon: '\u2753' },
};

function getAnswerStyle(answer) {
  if (!answer) return { bg: '#95a5a6', icon: '\u23f3' };
  for (const [key, val] of Object.entries(ANSWER_COLORS)) {
    if (answer.includes(key)) return val;
  }
  return { bg: '#3498db', icon: '\ud83d\udcac' };
}

/**
 * \u6d77\u9f9f\u6c64\u6e38\u620f\u4e3b\u7ec4\u4ef6
 */
export default function TurtleSoupGame({ socket, roomId, playerId, gameState, onAction, players, onLeaveRoom }) {
  const [questionInput, setQuestionInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [showGuessPanel, setShowGuessPanel] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.questions?.length, gameState?.guesses?.length]);

  useEffect(() => {
    if (!socket) return;

    const getNickname = (pid) => players.find(p => p.id === pid)?.nickname || '\u73a9\u5bb6';

    const handlers = {
      error: (data) => { setError(data.message); setTimeout(() => setError(''), 3000); },
      ai_thinking: () => { setNotification('\ud83e\udd16 AI\u6b63\u5728\u601d\u8003...'); },
      question_answered: () => { setNotification(''); },
      ai_judging_guess: () => { setNotification('\ud83e\udd16 AI\u6b63\u5728\u5224\u5b9a...'); },
      guess_result: (data) => {
        setNotification('');
        if (data.correct) {
          setNotification('\ud83c\udf89 ' + getNickname(data.pid) + ' \u731c\u5bf9\u4e86\uff01');
        }
      },
      player_skipped: (data) => {
        setNotification(getNickname(data.pid) + ' \u8df3\u8fc7\u4e86\u56de\u5408');
        setTimeout(() => setNotification(''), 2000);
      },
      turn_changed: (data) => {
        if (data.currentTurnPlayer === playerId) {
          setNotification('\ud83d\udce1 \u8f6e\u5230\u4f60\u63d0\u95ee\u4e86\uff01');
          setTimeout(() => setNotification(''), 3000);
        }
      },
    };

    for (const [event, handler] of Object.entries(handlers)) {
      socket.on(event, handler);
    }
    return () => {
      for (const [event, handler] of Object.entries(handlers)) {
        socket.off(event, handler);
      }
    };
  }, [socket, players, playerId]);

  if (!gameState) {
    return (
      <div className="ts-loading">
        <div className="ts-loading-icon">\ud83d\udc22</div>
        <p>\u7b49\u5f85\u6e38\u620f\u6570\u636e...</p>
      </div>
    );
  }

  const { phase, categories, votes, puzzle, currentTurn, questions, guesses, winner, scores } = gameState;
  const isMyTurn = gameState.players?.[currentTurn] === playerId;
  const currentTurnPlayer = gameState.players?.[currentTurn];
  const myScore = scores?.[playerId] || 0;

  const getNickname = (pid) => players.find(p => p.id === pid)?.nickname || '\u73a9\u5bb6';
  const getScore = (pid) => scores?.[pid] || 0;

  const emitAction = (action) => {
    if (socket && roomId) {
      socket.emit('game_action', { roomId, action });
    }
  };

  const handleVote = (categoryId) => {
    emitAction({ type: 'vote', categoryId });
  };

  const handleAsk = () => {
    if (!questionInput.trim()) return;
    emitAction({ type: 'ask', question: questionInput.trim() });
    setQuestionInput('');
  };

  const handleGuess = () => {
    if (!guessInput.trim()) return;
    emitAction({ type: 'guess', guess: guessInput.trim() });
    setGuessInput('');
    setShowGuessPanel(false);
  };

  const handleSkip = () => {
    emitAction({ type: 'skip' });
  };

  const handleKeyPress = (e, type) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (type === 'ask') handleAsk();
      if (type === 'guess') handleGuess();
    }
  };

  if (phase === 'ended' || winner) {
    return (
      <div className="ts">
        <div className="ts-result">
          <div className="ts-result-icon">{winner === playerId ? '\ud83c\udf89' : '\ud83d\udc22'}</div>
          <h2 className="ts-result-title">
            {winner ? getNickname(winner) + ' \u731c\u5bf9\u4e86\u771f\u76f8\uff01' : '\u6e38\u620f\u7ed3\u675f'}
          </h2>
          {puzzle && (
            <div className="ts-reveal">
              <div className="ts-reveal-label">\u771f\u76f8\u662f...</div>
              <div className="ts-reveal-answer">{puzzle.answer}</div>
            </div>
          )}
          <div className="ts-scores">
            <h3>\ud83d\udcca \u6700\u7ec8\u5f97\u5206</h3>
            {gameState.players?.map(pid => (
              <div key={pid} className={"ts-score-row" + (pid === winner ? " ts-score-winner" : "")}>
                <span className="ts-score-name">{getNickname(pid)}</span>
                <span className="ts-score-value">{getScore(pid)} \u5206</span>
              </div>
            ))}
          </div>
          <button className="ts-back-btn" onClick={onLeaveRoom || (() => window.location.href = '/lobby')}>
            \u8fd4\u56de\u5927\u5385
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'voting') {
    const voteSummary = {};
    if (categories) {
      for (const cat of categories) {
        voteSummary[cat.id] = 0;
      }
    }
    if (votes) {
      for (const [, catId] of Object.entries(votes)) {
        voteSummary[catId] = (voteSummary[catId] || 0) + 1;
      }
    }
    const myVote = votes?.[playerId];

    return (
      <div className="ts">
        <div className="ts-header">
          <h2 className="ts-title">\ud83d\udc22 \u6d77\u9f9f\u6c64</h2>
          <p className="ts-subtitle">\u9009\u62e9\u4f60\u60f3\u73a9\u7684\u8c1c\u9898\u7c7b\u578b</p>
        </div>
        <div className="ts-vote-grid">
          {categories?.map(cat => {
            const style = CATEGORY_COLORS[cat.id] || CATEGORY_COLORS.mystery;
            const isSelected = myVote === cat.id;
            const count = voteSummary[cat.id] || 0;
            return (
              <button
                key={cat.id}
                className={"ts-vote-card" + (isSelected ? " ts-vote-selected" : "")}
                style={{
                  background: isSelected
                    ? "linear-gradient(135deg, " + style.bg + ", " + style.bg + "dd)"
                    : "linear-gradient(135deg, " + style.light + ", " + style.light + "dd)",
                  color: isSelected ? '#fff' : style.text,
                  borderColor: isSelected ? style.bg : 'transparent',
                }}
                onClick={() => handleVote(cat.id)}
                disabled={!!myVote}
              >
                <div className="ts-vote-icon">{cat.icon}</div>
                <div className="ts-vote-name">{cat.name}</div>
                <div className="ts-vote-count">{count} \u7968</div>
                {isSelected && <div className="ts-vote-check">\u2713</div>}
              </button>
            );
          })}
        </div>
        <div className="ts-vote-status">
          {myVote
            ? "\u2705 \u5df2\u6295\u7968\uff0c\u7b49\u5f85\u5176\u4ed6\u73a9\u5bb6... (" + Object.keys(votes || {}).length + "/" + gameState.players?.length + ")"
            : '\u8bf7\u9009\u62e9\u4e00\u4e2a\u7c7b\u578b'
          }
        </div>
        <div className="ts-players-bar">
          {gameState.players?.map(pid => (
            <div key={pid} className={"ts-player-tag" + (votes?.[pid] ? " ts-player-voted" : "")}>
              {getNickname(pid)} {votes?.[pid] ? '\u2705' : '\u23f3'}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="ts">
      <div className="ts-top-bar">
        <div className="ts-info-tags">
          <span className="ts-tag">\u2753 \u5269\u4f59 {gameState.maxQuestions - (questions?.length || 0)} \u95ee</span>
          <span className="ts-tag">\ud83c\udfaf \u7b2c {gameState.roundNumber || 1} \u8f6e</span>
          <span className="ts-tag">\u2b50 {myScore} \u5206</span>
        </div>
        <div className={"ts-turn-tag" + (isMyTurn ? " ts-turn-mine" : "")}>
          {isMyTurn ? '\ud83d\udfe2 \u8f6e\u5230\u4f60\u63d0\u95ee' : "\u23f3 " + getNickname(currentTurnPlayer)}
        </div>
      </div>

      {puzzle && (
        <div className="ts-puzzle-card">
          <div className="ts-puzzle-category">
            {categories?.find(c => c.id === puzzle.category)?.icon}{' '}
            {categories?.find(c => c.id === puzzle.category)?.name}
          </div>
          <div className="ts-puzzle-title">{puzzle.title}</div>
        </div>
      )}

      <div className="ts-chat">
        {questions?.length === 0 && guesses?.length === 0 && (
          <div className="ts-chat-empty">
            <div className="ts-chat-empty-icon">\ud83d\udcac</div>
            <p>\u5f00\u59cb\u63d0\u95ee\u5427\uff01\u53ea\u80fd\u95ee"\u662f/\u4e0d\u662f"\u7c7b\u578b\u7684\u95ee\u9898</p>
          </div>
        )}

        {questions?.map((q, i) => {
          const answerStyle = getAnswerStyle(q.answer);
          return (
            <div key={"q-" + i} className={"ts-chat-msg" + (q.pid === playerId ? " ts-chat-mine" : "")}>
              <div className="ts-chat-header">
                <span className="ts-chat-name">{getNickname(q.pid)}</span>
                <span className="ts-chat-time">
                  {new Date(q.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="ts-chat-question">\u2753 {q.question}</div>
              {q.answer ? (
                <div className="ts-chat-answer" style={{ borderLeftColor: answerStyle.bg }}>
                  <span className="ts-chat-answer-icon">{answerStyle.icon}</span>
                  <span>{q.answer}</span>
                </div>
              ) : (
                <div className="ts-chat-answer ts-chat-thinking">\ud83e\udd16 AI\u601d\u8003\u4e2d...</div>
              )}
            </div>
          );
        })}

        {guesses?.map((g, i) => (
          <div key={"g-" + i} className={"ts-chat-msg ts-chat-guess" + (g.pid === playerId ? " ts-chat-mine" : "")}>
            <div className="ts-chat-header">
              <span className="ts-chat-name">{getNickname(g.pid)}</span>
              <span className="ts-chat-badge">\ud83c\udfaf \u731c\u6d4b</span>
            </div>
            <div className="ts-chat-guess-text">{g.guess}</div>
            {g.result ? (
              <div className={"ts-chat-guess-result" + (g.correct ? " ts-guess-correct" : "")}>
                {g.correct ? '\ud83c\udf89 ' : '\ud83e\udd14 '}{g.result}
              </div>
            ) : (
              <div className="ts-chat-guess-result">\ud83e\udd16 AI\u5224\u5b9a\u4e2d...</div>
            )}
          </div>
        ))}

        <div ref={chatEndRef} />
      </div>

      {notification && <div className="ts-notification">{notification}</div>}
      {error && <div className="ts-error">{error}</div>}

      <div className="ts-actions">
        <div className="ts-input-bar">
          <input
            className="ts-input"
            type="text"
            placeholder={isMyTurn ? '\u8f93\u5165\u4f60\u7684\u95ee\u9898\uff08\u662f/\u5426\u7c7b\u578b\uff09...' : '\u7b49\u5f85\u5176\u4ed6\u73a9\u5bb6\u63d0\u95ee...'}
            value={questionInput}
            onChange={e => setQuestionInput(e.target.value)}
            onKeyDown={e => handleKeyPress(e, 'ask')}
            disabled={!isMyTurn}
            maxLength={200}
          />
          <button
            className="ts-send-btn"
            onClick={handleAsk}
            disabled={!isMyTurn || !questionInput.trim()}
          >
            \u63d0\u95ee
          </button>
          {isMyTurn && (
            <button className="ts-skip-btn" onClick={handleSkip} title="\u8df3\u8fc7\u56de\u5408">
              \u23ed\ufe0f
            </button>
          )}
        </div>

        <button
          className="ts-guess-toggle-btn"
          onClick={() => setShowGuessPanel(!showGuessPanel)}
        >
          \ud83c\udfaf \u63d0\u4ea4\u731c\u6d4b
        </button>

        {showGuessPanel && (
          <div className="ts-guess-panel">
            <div className="ts-guess-panel-header">
              <span>\ud83c\udfaf \u63d0\u4ea4\u4f60\u7684\u6700\u7ec8\u731c\u6d4b</span>
              <button className="ts-guess-close" onClick={() => setShowGuessPanel(false)}>\u2715</button>
            </div>
            <textarea
              className="ts-guess-input"
              placeholder="\u8f93\u5165\u4f60\u5bf9\u8fd9\u4e2a\u8c1c\u9898\u7684\u5b8c\u6574\u731c\u6d4b..."
              value={guessInput}
              onChange={e => setGuessInput(e.target.value)}
              onKeyDown={e => handleKeyPress(e, 'guess')}
              rows={3}
              maxLength={500}
            />
            <button
              className="ts-guess-submit-btn"
              onClick={handleGuess}
              disabled={!guessInput.trim()}
            >
              \u63d0\u4ea4\u731c\u6d4b
            </button>
          </div>
        )}
      </div>

      <div className="ts-opponents">
        {gameState.players?.filter(pid => pid !== playerId).map(pid => (
          <div key={pid} className={"ts-opponent" + (currentTurnPlayer === pid ? " ts-opponent-active" : "")}>
            <span className="ts-opponent-name">{getNickname(pid)}</span>
            <span className="ts-opponent-score">{getScore(pid)}\u5206</span>
          </div>
        ))}
      </div>
    </div>
  );
}
