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
  '是': { bg: '#27ae60', icon: '✅' },
  '不是': { bg: '#e74c3c', icon: '❌' },
  '也不是': { bg: '#f39c12', icon: '⚠️' },
  '不相关': { bg: '#95a5a6', icon: '❓' },
};

function getAnswerStyle(answer) {
  if (!answer) return { bg: '#95a5a6', icon: '⏳' };
  for (const [key, val] of Object.entries(ANSWER_COLORS)) {
    if (answer.includes(key)) return val;
  }
  return { bg: '#3498db', icon: '💬' };
}

/**
 * 海龟汤游戏主组件
 */
export default function TurtleSoupGame({ socket, roomId, playerId, gameState, onAction, players, onLeaveRoom, onReturnToRoom }) {
  const [questionInput, setQuestionInput] = useState('');
  const [guessInput, setGuessInput] = useState('');
  const [showGuessPanel, setShowGuessPanel] = useState(false);
  const [error, setError] = useState('');
  const [notification, setNotification] = useState('');
  const [roundResults, setRoundResults] = useState(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameState?.questions?.length, gameState?.guesses?.length]);

  useEffect(() => {
    if (!socket) return;

    const getNickname = (pid) => players.find(p => p.id === pid)?.nickname || '玩家';

    const handlers = {
      error: (data) => { setError(data.message); setTimeout(() => setError(''), 3000); },
      ai_thinking: () => { setNotification('🤖 AI正在思考...'); },
      question_answered: () => { setNotification(''); },
      ai_judging_guess: () => { setNotification('🤖 AI正在判定...'); },
      ai_judging_all_guesses: () => { setNotification('🤖 AI正在为所有猜测打分...'); },
      guess_submitted: (data) => {
        setNotification('📝 ' + getNickname(data.pid) + ' 提交了猜测 (' + data.guessCount + '/' + data.totalPlayers + ')');
      },
      round_results: (data) => {
        setNotification('📊 第' + data.roundNumber + '轮结果已出！');
        setRoundResults(data);
      },
      new_round: (data) => {
        setNotification('🔄 第' + data.roundNumber + '轮开始！请选择题材');
        setRoundResults(null);
        setTimeout(() => setNotification(''), 3000);
      },
      player_skipped: (data) => {
        setNotification(getNickname(data.pid) + ' 跳过了回合');
        setTimeout(() => setNotification(''), 2000);
      },
      turn_changed: (data) => {
        if (data.currentTurnPlayer === playerId) {
          setNotification('📨 轮到你提问了！');
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
        <div className="ts-loading-icon">🐢</div>
        <p>等待游戏数据...</p>
      </div>
    );
  }

  const { phase, categories, votes, puzzle, currentTurn, questions, guesses, winner, scores, roundNumber, totalRounds, usedCategories, pendingGuesses, guessedPlayers } = gameState;
  const isMyTurn = gameState.players?.[currentTurn] === playerId;
  const currentTurnPlayer = gameState.players?.[currentTurn];
  const myScore = scores?.[playerId] || 0;
  const guessCount = Object.keys(pendingGuesses || {}).length;
  const totalPlayers = gameState.players?.length || 0;
  const hasGuessed = guessedPlayers?.[playerId] || false;

  const getNickname = (pid) => players.find(p => p.id === pid)?.nickname || '玩家';
  const getAvatar = (pid) => players.find(p => p.id === pid)?.avatar || null;
  const getAvatarColor = (name) => {
    const colors = ['#f44336','#e91e63','#9c27b0','#673ab7','#3f51b5','#2196f3','#00bcd4','#009688','#4caf50','#ff9800'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  };
  const getScore = (pid) => scores?.[pid] || 0;

  // 头像渲染组件
  const AvatarImg = ({ pid, size = 32 }) => {
    const avatar = getAvatar(pid);
    const nickname = getNickname(pid);
    if (avatar) {
      return <img src={avatar} alt={nickname} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />;
    }
    return <span className="ts-chat-avatar-text">{nickname.charAt(0)}</span>;
  };

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
    const sortedPlayers = [...(gameState.players || [])].sort((a, b) => (scores?.[b] || 0) - (scores?.[a] || 0));
    return (
      <div className="ts">
        <div className="ts-result">
          <div className="ts-result-icon">🏁</div>
          <h2 className="ts-result-title">
            {totalRounds || 5} 轮游戏结束！
          </h2>
          <div className="ts-scores">
            <h3>📊 最终排名</h3>
            {sortedPlayers.map((pid, i) => (
              <div key={pid} className={"ts-score-row" + (i === 0 ? " ts-score-winner" : "")}>
                <span className="ts-score-name">
                  {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : `#${i+1} `}
                  {getNickname(pid)}
                  {pid === playerId ? '（你）' : ''}
                </span>
                <span className="ts-score-value">{getScore(pid)} 分</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button className="ts-back-btn" onClick={onLeaveRoom || (() => window.location.href = '/lobby')}>
              返回大厅
            </button>
            <button className="ts-back-btn" onClick={onReturnToRoom}>
              返回房间
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'voting') {
    const voteSummary = {};
    const availableCategories = (categories || []).filter(c => !(usedCategories || []).includes(c.id));
    const catsToShow = availableCategories.length > 0 ? availableCategories : (categories || []);
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
          <h2 className="ts-title">🐢 海龟汤</h2>
          <p className="ts-subtitle">第 {roundNumber || 1}/{totalRounds || 5} 轮 · 选择你想玩的谜题类型</p>
        </div>
        <div className="ts-vote-grid">
          {catsToShow.map(cat => {
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
                <div className="ts-vote-count">{count} 票</div>
                {isSelected && <div className="ts-vote-check">✓</div>}
              </button>
            );
          })}
        </div>
        <div className="ts-vote-status">
          {myVote
            ? "✅ 已投票，等待其他玩家... (" + Object.keys(votes || {}).length + "/" + gameState.players?.length + ")"
            : '请选择一个类型'
          }
        </div>
        <div className="ts-players-bar">
          {gameState.players?.map(pid => (
            <div key={pid} className={"ts-player-tag" + (votes?.[pid] ? " ts-player-voted" : "")}>
              {getNickname(pid)} {votes?.[pid] ? '✅' : '⏳'}
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
          <span className="ts-tag">❓ 剩余 {gameState.maxQuestions - (questions?.length || 0)} 问</span>
          <span className="ts-tag">🎯 第 {gameState.roundNumber || 1} 轮</span>
          <span className="ts-tag">⭐ {myScore} 分</span>
        </div>
        <div className={"ts-turn-tag" + (isMyTurn ? " ts-turn-mine" : "")}>
          {isMyTurn ? '🟢 轮到你提问' : "⏳ " + getNickname(currentTurnPlayer)}
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
            <div className="ts-chat-empty-icon">💬</div>
            <p>开始提问吧！只能问"是/不是"类型的问题</p>
          </div>
        )}

        {questions?.map((q, i) => {
          const answerStyle = getAnswerStyle(q.answer);
          const nickname = getNickname(q.pid);
          const isMine = q.pid === playerId;
          return (
            <div key={"q-" + i} className={"ts-chat-msg" + (isMine ? " ts-chat-mine" : " ts-chat-other")}>
              <div className="ts-chat-avatar" style={{ background: getAvatarColor(nickname) }}>
                <AvatarImg pid={q.pid} size={32} />
              </div>
              <div className="ts-chat-body">
                <div className="ts-chat-header">
                  <span className="ts-chat-name">{nickname}</span>
                  <span className="ts-chat-time">
                    {new Date(q.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="ts-chat-bubble">
                  <div className="ts-chat-question">❓ {q.question}</div>
                  {q.answer ? (
                    <div className="ts-chat-answer" style={{ borderLeftColor: answerStyle.bg }}>
                      <span className="ts-chat-answer-icon">{answerStyle.icon}</span>
                      <span>{q.answer}</span>
                    </div>
                  ) : (
                    <div className="ts-chat-answer ts-chat-thinking">🤖 AI思考中...</div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {guesses?.map((g, i) => {
          const nickname = getNickname(g.pid);
          const isMine = g.pid === playerId;
          return (
          <div key={"g-" + i} className={"ts-chat-msg ts-chat-guess" + (isMine ? " ts-chat-mine" : " ts-chat-other")}>
            <div className="ts-chat-avatar" style={{ background: getAvatarColor(nickname) }}>
              <AvatarImg pid={g.pid} size={32} />
            </div>
            <div className="ts-chat-body">
              <div className="ts-chat-header">
                <span className="ts-chat-name">{nickname}</span>
                <span className="ts-chat-badge">🎯 猜测</span>
              </div>
              <div className="ts-chat-bubble">
                <div className="ts-chat-guess-text">{g.guess}</div>
                {g.result ? (
                  <div className={"ts-chat-guess-result" + (g.correct ? " ts-guess-correct" : "")}>
                    {g.correct ? '🎉 ' : '🤔 '}{g.result}
                  </div>
                ) : (
                  <div className="ts-chat-guess-result">🤖 AI判定中...</div>
                )}
              </div>
            </div>
          </div>
          );
        })}

        <div ref={chatEndRef} />
      </div>

      {notification && <div className="ts-notification">{notification}</div>}
      {roundResults && (
        <div className="ts-round-results">
          <h4>📊 第{roundResults.roundNumber}轮结果</h4>
          {roundResults.results?.map(r => (
            <div key={r.pid} className="ts-round-result-row">
              <span>{getNickname(r.pid)}</span>
              <span style={{fontWeight:'600', color: r.score >= 70 ? 'var(--success)' : r.score >= 40 ? 'var(--warning)' : 'var(--danger)'}}>
                {r.score}分
              </span>
            </div>
          ))}
          {roundResults.puzzle && (
            <div className="ts-reveal" style={{marginTop:'8px'}}>
              <div className="ts-reveal-label">真相</div>
              <div className="ts-reveal-answer">{roundResults.puzzle.answer}</div>
            </div>
          )}
        </div>
      )}
      {error && <div className="ts-error">{error}</div>}

      <div className="ts-actions">
        {hasGuessed ? (
          <div className="ts-guessed-waiting">
            <div className="ts-guessed-icon">⏳</div>
            <div className="ts-guessed-text">已提交猜测，等待其他玩家... ({guessCount}/{totalPlayers})</div>
          </div>
        ) : (
          <>
            <div className="ts-input-bar">
              <input
                className="ts-input"
                type="text"
                placeholder={isMyTurn ? '输入你的问题（是/否类型）...' : '等待其他玩家提问...'}
                value={questionInput}
                onChange={e => setQuestionInput(e.target.value)}
                onKeyDown={e => handleKeyPress(e, 'ask')}
                disabled={!isMyTurn || hasGuessed}
                maxLength={200}
              />
              <button
                className="ts-send-btn"
                onClick={handleAsk}
                disabled={!isMyTurn || !questionInput.trim() || hasGuessed}
              >
                提问
              </button>
              {isMyTurn && (
                <button className="ts-skip-btn" onClick={handleSkip} title="跳过回合">
                  ⏭️
                </button>
              )}
            </div>

            <button
              className="ts-guess-toggle-btn"
              onClick={() => setShowGuessPanel(!showGuessPanel)}
            >
              🎯 提交猜测 {guessCount > 0 && `(${guessCount}/${totalPlayers})`}
            </button>

            {showGuessPanel && (
              <div className="ts-guess-panel">
                <div className="ts-guess-panel-header">
                  <span>🎯 提交你的最终猜测</span>
                  <button className="ts-guess-close" onClick={() => setShowGuessPanel(false)}>✕</button>
                </div>
                <textarea
                  className="ts-guess-input"
                  placeholder="输入你对这个谜题的完整猜测..."
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
                  提交猜测
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="ts-opponents">
        {gameState.players?.filter(pid => pid !== playerId).map(pid => (
          <div key={pid} className={"ts-opponent" + (currentTurnPlayer === pid ? " ts-opponent-active" : "")}>
            <span className="ts-opponent-name">{getNickname(pid)}</span>
            <span className="ts-opponent-score">{getScore(pid)}分</span>
          </div>
        ))}
      </div>
    </div>
  );
}
