import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import localforage from 'localforage';
import BracketView from './BracketView';
import StandingsTable from './StandingsTable';

function App() {
  const [view, setView] = useState('admin');
  const [tournaments, setTournaments] = useState([]);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  
  const [newTournamentName, setNewTournamentName] = useState('');
  const [newTournamentFormat, setNewTournamentFormat] = useState('eliminacion');
  const [selectedTournamentId, setSelectedTournamentId] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerRanking, setNewPlayerRanking] = useState(1);

  const [activeMatch, setActiveMatch] = useState(null);
  const [currentSet, setCurrentSet] = useState({ p1: 0, p2: 0 });
  const [sets, setSets] = useState([]);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetchTournaments();
    updatePendingCount();
    
    const handleOnline = () => { setIsOnline(true); syncPendingScores(); };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (selectedTournamentId) {
      fetchPlayers(selectedTournamentId);
      fetchMatches(selectedTournamentId);
    }
  }, [selectedTournamentId]);

  const fetchTournaments = async () => {
    const { data } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
    if (data) setTournaments(data);
  };

  const fetchPlayers = async (tournamentId) => {
    const { data } = await supabase.from('players').select('*').eq('tournament_id', tournamentId).order('ranking', { ascending: true });
    if (data) setPlayers(data);
  };

  const fetchMatches = async (tournamentId) => {
    const { data } = await supabase.from('matches').select('*').eq('tournament_id', tournamentId).order('table_number', { ascending: true });
    if (data) setMatches(data);
  };

  const handleCreateTournament = async (e) => {
    e.preventDefault();
    if (!newTournamentName.trim()) return alert('⚠️ Escribe un nombre');
    const { error } = await supabase.from('tournaments').insert([{ name: newTournamentName.trim(), format: newTournamentFormat, best_of: 3 }]);
    if (error) alert('❌ Error: ' + error.message);
    else {
      alert('✅ Torneo creado');
      setNewTournamentName('');
      fetchTournaments();
    }
  };

  const handleAddPlayer = async (e) => {
  e.preventDefault();
  if (!newPlayerName.trim() || !selectedTournamentId) return alert('⚠️ Completa todos los campos');
  
  const { error } = await supabase.from('players').insert([{ 
    name: newPlayerName.trim(), 
    ranking: newPlayerRanking, 
    tournament_id: selectedTournamentId 
  }]);
  
  if (error) {
    alert('❌ Error: ' + error.message);
  } else {
    setNewPlayerName('');
    
    // Recargar jugadores para obtener la lista actualizada
    await fetchPlayers(selectedTournamentId);
    
    // Calcular el siguiente ranking disponible
    const { data: updatedPlayers } = await supabase
      .from('players')
      .select('ranking')
      .eq('tournament_id', selectedTournamentId)
      .order('ranking', { ascending: true });
    
    if (updatedPlayers && updatedPlayers.length > 0) {
      const maxRanking = Math.max(...updatedPlayers.map(p => p.ranking));
      setNewPlayerRanking(maxRanking + 1);
    } else {
      setNewPlayerRanking(1);
    }
  }
};

  // FUNCIÓN PARA ELIMINACIÓN DIRECTA
  const generateEliminationBracket = async () => {
  if (players.length < 2) return alert('⚠️ Necesitas al menos 2 jugadores');

  await supabase.from('matches').delete().eq('tournament_id', selectedTournamentId);

  const sorted = [...players].sort((a, b) => a.ranking - b.ranking);
  const n = sorted.length;
  
  // Calcular tamaño del bracket (siguiente potencia de 2)
  let size = 2;
  while (size < n) size *= 2;
  
  const numRounds = Math.log2(size); // Ej: 16 = 4 rondas
  const numByes = size - n;
  
  const matchesToCreate = [];
  let matchId = 1;

  // Generar nombres de rondas
  const roundNames = [];
  for (let i = numRounds; i >= 1; i--) {
    const matchesInRound = Math.pow(2, i - 1);
    if (matchesInRound === 1) roundNames.push('Final');
    else if (matchesInRound === 2) roundNames.push('Semifinales');
    else if (matchesInRound === 4) roundNames.push('Cuartos de Final');
    else if (matchesInRound === 8) roundNames.push('Octavos de Final');
    else roundNames.push(`Ronda de ${matchesInRound * 2}`);
  }
  roundNames.reverse(); // Para que Ronda 1 sea la primera

  // ALGORITMO DE SIEMBRA CORREGIDO
  const generateSeedOrder = (bracketSize) => {
    if (bracketSize === 2) return [1, 2];
    if (bracketSize === 4) return [1, 4, 2, 3];
    if (bracketSize === 8) return [1, 8, 4, 5, 2, 7, 3, 6];
    if (bracketSize === 16) return [1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11];
    
    // Algoritmo genérico
    const order = [1, 2];
    while (order.length < bracketSize) {
      const newOrder = [];
      const nextSize = order.length * 2;
      for (let i = 0; i < order.length; i++) {
        newOrder.push(order[i]);
        newOrder.push(nextSize + 1 - order[i]);
      }
      order.length = 0;
      order.push(...newOrder);
    }
    return order;
  };

  const seedOrder = generateSeedOrder(size);

  // RONDA 1: Generar partidos con jugadores y BYEs
  const firstRoundMatches = [];
  for (let i = 0; i < size / 2; i++) {
    const seed1 = seedOrder[i * 2];
    const seed2 = seedOrder[i * 2 + 1];
    
    const player1 = seed1 <= n ? sorted[seed1 - 1] : null;
    const player2 = seed2 <= n ? sorted[seed2 - 1] : null;

    let winnerId = null;
    let status = 'pending';
    
    // Si uno tiene BYE, el otro avanza automáticamente
    if (player1 && !player2) {
      winnerId = player1.id;
      status = 'completed';
    } else if (!player1 && player2) {
      winnerId = player2.id;
      status = 'completed';
    }

    firstRoundMatches.push({
      tournament_id: selectedTournamentId,
      player1_id: player1?.id || null,
      player2_id: player2?.id || null,
      winner_id: winnerId,
      status: status,
      round: roundNames[0], // "Ronda 1"
      table_number: i + 1,
      round_number: 1
    });
  }

  matchesToCreate.push(...firstRoundMatches);

  // RONDAS SIGUIENTES: Generar partidos vacíos (cuartos, semis, final)
  let currentRoundNumber = 2;
  let matchesInPreviousRound = size / 2;

  while (matchesInPreviousRound > 1) {
    const matchesInThisRound = matchesInPreviousRound / 2;
    const roundName = roundNames[currentRoundNumber - 1];

    for (let i = 0; i < matchesInThisRound; i++) {
      matchesToCreate.push({
        tournament_id: selectedTournamentId,
        player1_id: null,
        player2_id: null,
        winner_id: null,
        status: 'pending',
        round: roundName,
        table_number: matchId++,
        round_number: currentRoundNumber
      });
    }

    matchesInPreviousRound = matchesInThisRound;
    currentRoundNumber++;
  }

  // Guardar en Supabase
  const { error } = await supabase.from('matches').insert(matchesToCreate);
  
  if (error) {
    alert('❌ Error: ' + error.message);
  } else {
    const firstRoundReal = firstRoundMatches.filter(m => m.status === 'pending').length;
    const byes = firstRoundMatches.filter(m => m.status === 'completed').length;
    alert(`✅ Cuadro completo generado:\n\n${n} jugadores\n${numByes} BYEs\n${firstRoundReal} partidos en Ronda 1\n${numRounds} rondas totales`);
    fetchMatches(selectedTournamentId);
  }
};

  // FUNCIÓN PARA TODOS CONTRA TODOS (CORREGIDA)
  const generateRoundRobin = async () => {
    if (players.length < 2) return alert('⚠️ Necesitas al menos 2 jugadores');

    await supabase.from('matches').delete().eq('tournament_id', selectedTournamentId);

    const sorted = [...players].sort((a, b) => a.ranking - b.ranking);
    let n = sorted.length;
    
    // Si es número impar de jugadores, agregar un BYE ficticio
    const playersList = n % 2 === 0 ? [...sorted] : [...sorted, { id: 'BYE', name: 'BYE' }];
    const totalPlayers = playersList.length;
    const numRounds = totalPlayers - 1;
    const matchesPerRound = totalPlayers / 2;
    
    const matchesToCreate = [];
    let tableNum = 1;
    
    // ALGORITMO DEL CÍRCULO (Circle Method) - Estándar profesional
    const fixed = playersList[0];
    const rotating = playersList.slice(1);
    
    for (let round = 0; round < numRounds; round++) {
      const currentRound = [fixed, ...rotating];
      
      for (let i = 0; i < matchesPerRound; i++) {
        const player1 = currentRound[i];
        const player2 = currentRound[totalPlayers - 1 - i];
        
        if (player1.id !== 'BYE' && player2.id !== 'BYE') {
          matchesToCreate.push({
            tournament_id: selectedTournamentId,
            player1_id: player1.id,
            player2_id: player2.id,
            winner_id: null,
            status: 'pending',
            round: `Ronda ${round + 1}`,
            table_number: tableNum++
          });
        }
      }
      
      rotating.unshift(rotating.pop());
    }

    const { error } = await supabase.from('matches').insert(matchesToCreate);
    
    if (error) {
      alert('❌ Error: ' + error.message);
    } else {
      alert(`✅ Calendario generado: ${matchesToCreate.length} partidos en ${numRounds} rondas`);
      fetchMatches(selectedTournamentId);
    }
  };

  // FUNCIÓN QUE DECIDE QUÉ ALGORITMO USAR
  const handleGenerateBracket = async () => {
    const tournament = tournaments.find(t => t.id === selectedTournamentId);
    if (!tournament) return;

    if (tournament.format === 'eliminacion') {
      generateEliminationBracket();
    } else if (tournament.format === 'round_robin') {
      generateRoundRobin();
    } else {
      alert('⚠️ Formato no soportado');
    }
  };

  const getPlayerName = (playerId) => {
    if (!playerId) return 'BYE';
    const player = players.find(p => p.id === playerId);
    return player ? player.name : 'Desconocido';
  };

  const openRefereeView = (match) => {
    if (match.status === 'completed') return alert('⚠️ Este partido ya fue finalizado.');
    setActiveMatch(match);
    setCurrentSet({ p1: 0, p2: 0 });
    setSets([]);
  };

  const addPoint = (player) => {
    const newSet = { ...currentSet };
    newSet[player] += 1;
    
    if ((newSet.p1 >= 11 || newSet.p2 >= 11) && Math.abs(newSet.p1 - newSet.p2) >= 2) {
      setSets([...sets, newSet]);
      setCurrentSet({ p1: 0, p2: 0 });
    } else {
      setCurrentSet(newSet);
    }
  };

  const saveMatchResult = async () => {
    const finalSets = [...sets, currentSet].filter(s => s.p1 > 0 || s.p2 > 0);
    if (finalSets.length === 0) return alert('⚠️ El partido no ha comenzado');

    const p1SetsWon = finalSets.filter(s => s.p1 > s.p2).length;
    const p2SetsWon = finalSets.filter(s => s.p2 > s.p1).length;
    const winnerId = p1SetsWon > p2SetsWon ? activeMatch.player1_id : activeMatch.player2_id;

    const payload = {
      matchId: activeMatch.id,
      winnerId: winnerId,
      sets: finalSets,
      timestamp: new Date().toISOString()
    };

    if (isOnline) {
      await sendToSupabase(payload);
    } else {
      await localforage.setItem(`pending_match_${activeMatch.id}_${Date.now()}`, payload);
      alert('💾 Sin conexión. Resultado guardado en el dispositivo.');
      updatePendingCount();
    }
    
    setActiveMatch(null);
    fetchMatches(selectedTournamentId);
  };

  const sendToSupabase = async (payload) => {
    try {
      await supabase.from('matches').update({ status: 'completed', winner_id: payload.winnerId }).eq('id', payload.matchId);
      
      const setsToInsert = payload.sets.map(s => ({
        match_id: payload.matchId,
        player1_score: s.p1,
        player2_score: s.p2
      }));
      await supabase.from('sets').insert(setsToInsert);
      alert('✅ Resultado enviado a la base de datos.');
    } catch (error) {
      console.error('Error al guardar:', error);
      await localforage.setItem(`pending_match_${payload.matchId}_${Date.now()}`, payload);
      updatePendingCount();
    }
  };

  const updatePendingCount = async () => {
    const keys = await localforage.keys();
    setPendingCount(keys.filter(k => k.startsWith('pending_match_')).length);
  };

  const syncPendingScores = async () => {
    const keys = await localforage.keys();
    let synced = 0;
    for (const key of keys) {
      if (key.startsWith('pending_match_')) {
        const payload = await localforage.getItem(key);
        await sendToSupabase(payload);
        await localforage.removeItem(key);
        synced++;
      }
    }
    if (synced > 0) {
      alert(`🔄 Sincronizados ${synced} partidos pendientes.`);
      updatePendingCount();
      if (selectedTournamentId) fetchMatches(selectedTournamentId);
    }
  };

  // VISTA DEL ÁRBITRO
  if (view === 'referee' && activeMatch) {
    const p1Name = getPlayerName(activeMatch.player1_id);
    const p2Name = getPlayerName(activeMatch.player2_id);

    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '500px', margin: '0 auto', padding: '20px', background: '#f8fafc', minHeight: '100vh' }}>
        <button onClick={() => setActiveMatch(null)} style={{ marginBottom: '20px', padding: '10px', background: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          ← Volver
        </button>

        <div style={{ background: isOnline ? '#dcfce7' : '#fee2e2', color: isOnline ? '#166534' : '#991b1b', padding: '10px', borderRadius: '6px', textAlign: 'center', fontWeight: 'bold', marginBottom: '20px' }}>
          {isOnline ? '🟢 En línea' : '🔴 MODO OFFLINE'}
          {pendingCount > 0 && <span style={{ marginLeft: '10px', background: '#991b1b', color: 'white', padding: '2px 8px', borderRadius: '10px', fontSize: '12px' }}>{pendingCount} pendientes</span>}
        </div>

        <h2 style={{ textAlign: 'center', color: '#1e3a8a' }}>Mesa {activeMatch.table_number}</h2>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h3 style={{ color: '#2563eb', fontSize: '20px' }}>{p1Name}</h3>
            <div style={{ fontSize: '64px', fontWeight: 'bold', color: '#1e3a8a' }}>{currentSet.p1}</div>
            <button onClick={() => addPoint('p1')} style={{ width: '100%', padding: '20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '12px', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
              + PUNTO
            </button>
          </div>
          
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#94a3b8', padding: '0 20px' }}>VS</div>
          
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h3 style={{ color: '#dc2626', fontSize: '20px' }}>{p2Name}</h3>
            <div style={{ fontSize: '64px', fontWeight: 'bold', color: '#991b1b' }}>{currentSet.p2}</div>
            <button onClick={() => addPoint('p2')} style={{ width: '100%', padding: '20px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '12px', fontSize: '24px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>
              + PUNTO
            </button>
          </div>
        </div>

        {sets.length > 0 && (
          <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#64748b' }}>SETS:</h4>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              {sets.map((s, i) => (
                <div key={i} style={{ background: '#f1f5f9', padding: '8px 12px', borderRadius: '6px', fontWeight: 'bold' }}>
                  Set {i + 1}: <span style={{ color: '#2563eb' }}>{s.p1}</span> - <span style={{ color: '#dc2626' }}>{s.p2}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={saveMatchResult} disabled={sets.length === 0 && currentSet.p1 === 0 && currentSet.p2 === 0} style={{ width: '100%', padding: '18px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '12px', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer', opacity: (sets.length === 0 && currentSet.p1 === 0 && currentSet.p2 === 0) ? 0.5 : 1 }}>
          FINALIZAR PARTIDO
        </button>
      </div>
    );
  }

  // VISTA DEL BRACKET
  if (view === 'bracket') {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ color: '#1e3a8a', margin: 0 }}>🏆 Cuadro del Torneo</h1>
          <button onClick={() => setView('admin')} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            ← Volver
          </button>
        </div>

        {matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: '#f8fafc', borderRadius: '12px' }}>
            <p style={{ fontSize: '18px', color: '#64748b' }}>No hay partidos generados aún.</p>
          </div>
        ) : (
          <BracketView 
            matches={matches} 
            players={players} 
            onMatchClick={(match) => {
              if (match.status !== 'completed') {
                openRefereeView(match);
                setView('referee');
              }
            }}
          />
        )}
      </div>
    );
  }

  // VISTA DE TABLA DE POSICIONES
  if (view === 'standings') {
    return (
      <div style={{ fontFamily: 'system-ui, sans-serif', padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ color: '#1e3a8a', margin: 0 }}>📊 Clasificación del Torneo</h1>
          <button onClick={() => setView('admin')} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            ← Volver
          </button>
        </div>

        {matches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', background: '#f8fafc', borderRadius: '12px' }}>
            <p style={{ fontSize: '18px', color: '#64748b' }}>No hay partidos jugados aún.</p>
          </div>
        ) : (
          <StandingsTable matches={matches} players={players} />
        )}
      </div>
    );
  }

  // VISTA DE ADMINISTRADOR
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ color: '#1e3a8a', margin: 0 }}>🏓 Gestor de Torneos</h1>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => setView('standings')} style={{ padding: '10px 20px', background: '#10b981', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            📊 Posiciones
          </button>
          <button onClick={() => setView('bracket')} style={{ padding: '10px 20px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            🏆 Bracket
          </button>
          <button onClick={() => setView('referee')} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
            ⚖️ Árbitro
          </button>
        </div>
      </div>

      <section style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
        <h2>1. Crear Torneo</h2>
        <form onSubmit={handleCreateTournament}>
          <input type="text" placeholder="Nombre del Torneo" value={newTournamentName} onChange={(e) => setNewTournamentName(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
          <select value={newTournamentFormat} onChange={(e) => setNewTournamentFormat(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '15px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <option value="eliminacion">🏆 Eliminación Directa</option>
            <option value="round_robin">🔄 Todos contra Todos</option>
          </select>
          <button type="submit" style={{ width: '100%', padding: '14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Crear Torneo</button>
        </form>
      </section>

      {tournaments.length > 0 && (
        <section style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '20px' }}>
          <h2>2. Gestionar</h2>
          <select value={selectedTournamentId} onChange={(e) => setSelectedTournamentId(e.target.value)} style={{ width: '100%', padding: '12px', marginBottom: '20px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
            <option value="">-- Selecciona un torneo --</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          {selectedTournamentId && (
            <>
              <form onSubmit={handleAddPlayer} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                <input type="text" placeholder="Nombre" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} style={{ flex: 2, padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
                <input type="number" placeholder="Ranking" value={newPlayerRanking} onChange={(e) => setNewPlayerRanking(Number(e.target.value))} style={{ flex: 1, padding: '12px', borderRadius: '6px', border: '1px solid #cbd5e1' }} min="1" />
                <button type="submit" style={{ padding: '12px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Agregar</button>
              </form>

              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
                  <h3>Jugadores ({players.length})</h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {players.map((p) => (
                      <li key={p.id} style={{ background: 'white', padding: '10px', marginBottom: '8px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                        <span><span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: '50%', width: '28px', height: '28px', display: 'inline-block', textAlign: 'center', lineHeight: '28px', fontWeight: 'bold', marginRight: '10px' }}>{p.ranking}</span>{p.name}</span>
                      </li>
                    ))}
                  </ul>
                  {players.length >= 2 && (
                    <button onClick={handleGenerateBracket} style={{ width: '100%', padding: '14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                      🏆 GENERAR {tournaments.find(t => t.id === selectedTournamentId)?.format === 'round_robin' ? 'CALENDARIO' : 'CUADRO'}
                    </button>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: '300px' }}>
                  <h3>Partidos ({matches.length})</h3>
                  {matches.length === 0 ? <p style={{ color: '#64748b' }}>Genera el cuadro primero.</p> : (
                    <div style={{ display: 'grid', gap: '10px' }}>
                      {matches.map((match) => (
                        <div key={match.id} style={{ background: match.status === 'completed' ? '#dcfce7' : 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>Mesa {match.table_number}</strong>
                            <div style={{ fontSize: '14px', color: '#64748b' }}>{getPlayerName(match.player1_id)} vs {getPlayerName(match.player2_id)}</div>
                          </div>
                          <button onClick={() => openRefereeView(match)} disabled={match.status === 'completed'} style={{ padding: '8px 16px', background: match.status === 'completed' ? '#94a3b8' : '#7c3aed', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                            {match.status === 'completed' ? '✅' : '⚖️'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

export default App;