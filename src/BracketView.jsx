import './bracket.css';

export default function BracketView({ matches, players, onMatchClick }) {
  const getPlayerName = (playerId) => {
    if (!playerId) return 'TBD';
    const player = players.find(p => p.id === playerId);
    return player ? player.name : 'Desconocido';
  };

  const getWinnerName = (match) => {
    if (!match.winner_id) return null;
    return getPlayerName(match.winner_id);
  };

  // Agrupar partidos por round_number
  const rounds = {};
  matches.forEach(match => {
    const roundNum = match.round_number || 1;
    if (!rounds[roundNum]) rounds[roundNum] = [];
    rounds[roundNum].push(match);
  });

  const roundNumbers = Object.keys(rounds).map(Number).sort((a, b) => a - b);

  return (
    <div className="bracket-container">
      <div className="bracket-scroll">
        {roundNumbers.map((roundNum, roundIndex) => {
          const roundMatches = rounds[roundNum];
          const roundName = roundMatches[0]?.round || `Ronda ${roundNum}`;
          const isLastRound = roundIndex === roundNumbers.length - 1;

          return (
            <div key={roundNum} className="bracket-round">
              <h3 className="round-title">{roundName}</h3>
              <div className="round-matches">
                {roundMatches.map((match, matchIndex) => {
                  const p1Name = getPlayerName(match.player1_id);
                  const p2Name = getPlayerName(match.player2_id);
                  const winnerName = getWinnerName(match);
                  const isCompleted = match.status === 'completed';
                  const p1Won = isCompleted && match.winner_id === match.player1_id;
                  const p2Won = isCompleted && match.winner_id === match.player2_id;
                  const hasBye = !match.player1_id || !match.player2_id;

                  // Calcular posición para líneas conectoras
                  const matchPosition = matchIndex;
                  const totalMatchesInRound = roundMatches.length;
                  const spacing = 100 / totalMatchesInRound;

                  return (
                    <div key={match.id} className="match-wrapper">
                      <div 
                        className={`match-card ${isCompleted ? 'completed' : 'pending'} ${hasBye ? 'bye-match' : ''}`}
                        onClick={() => onMatchClick && onMatchClick(match)}
                      >
                        <div className="match-header">
                          <span className="match-label">
                            {roundName} - Game {matchIndex + 1}
                          </span>
                        </div>
                        
                        <div className={`team-row ${p1Won ? 'winner' : ''} ${!match.player1_id ? 'empty' : ''}`}>
                          <span className="team-name">{p1Name}</span>
                          {isCompleted && (
                            <span className="team-score">{p1Won ? '1' : '0'}</span>
                          )}
                        </div>
                        
                        <div className={`team-row ${p2Won ? 'winner' : ''} ${!match.player2_id ? 'empty' : ''}`}>
                          <span className="team-name">{p2Name}</span>
                          {isCompleted && (
                            <span className="team-score">{p2Won ? '1' : '0'}</span>
                          )}
                        </div>

                        {hasBye && (
                          <div className="bye-label">BYE</div>
                        )}

                        {isCompleted && winnerName && !isLastRound && (
                          <div className="winner-advance">
                            → {winnerName}
                          </div>
                        )}
                      </div>

                      {/* Líneas conectoras */}
                      {!isLastRound && matchIndex % 2 === 0 && roundIndex < roundNumbers.length - 1 && (
                        <div className="connector-lines">
                          <div className="connector-vertical"></div>
                          <div className="connector-horizontal"></div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}