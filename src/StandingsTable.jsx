import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import './standings.css';

export default function StandingsTable({ matches, players }) {
  const [standings, setStandings] = useState([]);
  const [setsData, setSetsData] = useState([]);

  // Cargar los sets reales desde Supabase
  useEffect(() => {
    const fetchSets = async () => {
      if (matches.length === 0) return;

      const matchIds = matches.map(m => m.id);
      const { data, error } = await supabase
        .from('sets')
        .select('*')
        .in('match_id', matchIds);

      if (data) setSetsData(data);
      if (error) console.error('Error al cargar sets:', error);
    };

    fetchSets();
  }, [matches]);

  // Calcular estadísticas completas
  useEffect(() => {
    if (players.length === 0) {
      setStandings([]);
      return;
    }

    const standings = players.map(player => {
      // Partidos jugados, ganados, perdidos
      const playerMatches = matches.filter(m => 
        m.status === 'completed' && 
        (m.player1_id === player.id || m.player2_id === player.id)
      );
      
      const matchesPlayed = playerMatches.length;
      const matchesWon = playerMatches.filter(m => m.winner_id === player.id).length;
      const matchesLost = matchesPlayed - matchesWon;

      // Sets ganados y perdidos (USANDO DATOS REALES)
      let setsWon = 0;
      let setsLost = 0;
      let pointsWon = 0;
      let pointsLost = 0;

      playerMatches.forEach(match => {
        const isPlayer1 = match.player1_id === player.id;
        
        // Obtener los sets de este partido
        const matchSets = setsData.filter(s => s.match_id === match.id);
        
        matchSets.forEach(set => {
          if (isPlayer1) {
            if (set.player1_score > set.player2_score) {
              setsWon++;
            } else {
              setsLost++;
            }
            pointsWon += set.player1_score;
            pointsLost += set.player2_score;
          } else {
            if (set.player2_score > set.player1_score) {
              setsWon++;
            } else {
              setsLost++;
            }
            pointsWon += set.player2_score;
            pointsLost += set.player1_score;
          }
        });
      });

      // Coeficientes
      const setsCoefficient = setsLost > 0 ? setsWon / setsLost : setsWon;
      const pointsCoefficient = pointsLost > 0 ? pointsWon / pointsLost : pointsWon;

      return {
        player,
        matchesPlayed,
        matchesWon,
        matchesLost,
        setsWon,
        setsLost,
        setsCoefficient: parseFloat(setsCoefficient.toFixed(3)),
        pointsWon,
        pointsLost,
        pointsCoefficient: parseFloat(pointsCoefficient.toFixed(3))
      };
    });

    // Ordenar por criterios de desempate
    standings.sort((a, b) => {
      // 1. Partidos ganados
      if (b.matchesWon !== a.matchesWon) {
        return b.matchesWon - a.matchesWon;
      }
      
      // 2. Enfrentamiento directo (si hay empate entre 2 jugadores)
      const directMatch = matches.find(m => 
        m.status === 'completed' &&
        ((m.player1_id === a.player.id && m.player2_id === b.player.id) ||
         (m.player1_id === b.player.id && m.player2_id === a.player.id))
      );
      
      if (directMatch) {
        if (directMatch.winner_id === a.player.id) return -1;
        if (directMatch.winner_id === b.player.id) return 1;
      }
      
      // 3. Coeficiente de sets
      if (b.setsCoefficient !== a.setsCoefficient) {
        return b.setsCoefficient - a.setsCoefficient;
      }
      
      // 4. Coeficiente de puntos
      return b.pointsCoefficient - a.pointsCoefficient;
    });

    setStandings(standings);
  }, [matches, players, setsData]);

  return (
    <div className="standings-container">
      <h2 className="standings-title">📊 Tabla de Posiciones</h2>
      
      {standings.length === 0 ? (
        <div className="standings-empty">
          <p>No hay partidos jugados aún.</p>
          <p style={{ fontSize: '14px', color: '#94a3b8' }}>
            Juega algunos partidos para ver la clasificación.
          </p>
        </div>
      ) : (
        <div className="standings-table-wrapper">
          <table className="standings-table">
            <thead>
              <tr>
                <th className="col-position">#</th>
                <th className="col-player">Jugador</th>
                <th className="col-stat">PJ</th>
                <th className="col-stat">PG</th>
                <th className="col-stat">PP</th>
                <th className="col-stat">SG</th>
                <th className="col-stat">SP</th>
                <th className="col-stat">Coef Sets</th>
                <th className="col-stat">PG</th>
                <th className="col-stat">PP</th>
                <th className="col-stat">Coef Pts</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((standing, index) => (
                <tr key={standing.player.id} className={index < 3 ? `top-${index + 1}` : ''}>
                  <td className="col-position">
                    <span className={`position-badge position-${index + 1}`}>
                      {index + 1}
                    </span>
                  </td>
                  <td className="col-player">
                    <div className="player-info">
                      <span className="player-name">{standing.player.name}</span>
                      <span className="player-ranking">#{standing.player.ranking}</span>
                    </div>
                  </td>
                  <td className="col-stat">{standing.matchesPlayed}</td>
                  <td className="col-stat won">{standing.matchesWon}</td>
                  <td className="col-stat lost">{standing.matchesLost}</td>
                  <td className="col-stat">{standing.setsWon}</td>
                  <td className="col-stat">{standing.setsLost}</td>
                  <td className="col-stat coefficient">{standing.setsCoefficient}</td>
                  <td className="col-stat">{standing.pointsWon}</td>
                  <td className="col-stat">{standing.pointsLost}</td>
                  <td className="col-stat coefficient">{standing.pointsCoefficient}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="standings-legend">
        <h4>Leyenda:</h4>
        <div className="legend-items">
          <span><strong>PJ:</strong> Partidos Jugados</span>
          <span><strong>PG:</strong> Partidos Ganados</span>
          <span><strong>PP:</strong> Partidos Perdidos</span>
          <span><strong>SG:</strong> Sets Ganados</span>
          <span><strong>SP:</strong> Sets Perdidos</span>
          <span><strong>Coef Sets:</strong> SG ÷ SP</span>
          <span><strong>PG (pts):</strong> Puntos Ganados</span>
          <span><strong>PP (pts):</strong> Puntos Perdidos</span>
          <span><strong>Coef Pts:</strong> PG ÷ PP</span>
        </div>
        <div className="tiebreaker-rules">
          <h4>Criterios de Desempate (en orden):</h4>
          <ol>
            <li>Mayor número de partidos ganados</li>
            <li>Resultado del enfrentamiento directo (serie particular)</li>
            <li>Mayor coeficiente de sets (SG ÷ SP)</li>
            <li>Mayor coeficiente de puntos (PG ÷ PP)</li>
          </ol>
        </div>
      </div>
    </div>
  );
}