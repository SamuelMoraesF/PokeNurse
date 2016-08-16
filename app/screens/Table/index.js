import React from 'react'
import {
  ipcRenderer
} from 'electron'
import $ from 'jquery'

window.$ = window.jQuery = $
require('bootstrap')

import SpeciesTable from './components/Species'

import {
  Immutable,
  Organize
} from '../../utils'

const COLUMN_SORT_AS_NUM = {
  nickname: false,
  iv: true,
  cp: true,
  favorite: true,
  pokemon_id: true,
  name: false,
  count: true,
  candy: true,
  evolves: true
}

let running = false

// Helper Methods

function runningCheck() {
  if (running) {
    ipcRenderer.send('error-message', 'An action is already running')
    return true
  }
  return false
}

function countDown(method, index, statusH, callback) {
  const interval = setInterval(() => {
    statusH.innerHTML = method + ' / ' + index + ' second(s) left'
    index--
    if (index <= 0) {
      clearInterval(interval)
      running = false
      statusH.innerHTML = 'Idle'
      callback()
    }
  }, 1000)
}

function randomDelay(min, max) {
  return Math.round((min + Math.random() * (max - min)) * 1000)
}

function setBackgroundImage(team) {
  const header = document.getElementById('profile-header')
  let teamName = null
  switch (team) {
    case 1:
      teamName = 'mystic'
      break
    case 2:
      teamName = 'valor'
      break
    case 3:
      teamName = 'instinct'
      break
    default:
  }

  header.style.backgroundImage = `url("./imgs/${teamName}.jpg")`
}

const Table = React.createClass({

  childContextTypes: {
    monsterUpdater: React.PropTypes.func.isRequired
  },

  getInitialState() {
    const monsters = ipcRenderer.sendSync('get-players-pokemons')
    const sortBy = 'pokemon_id'
    const sortDir = 'ASC'

    return {
      monsters: this.getNewMonsters(monsters, sortBy, sortDir),
      filterBy: '',
      sortBy,
      sortDir
    }
  },

  getChildContext() {
    return {
      monsterUpdater: this.updateMonster
    }
  },

  componentDidMount() {
    document.title = 'PokéNurse • Home'

    ipcRenderer.on('receive-players-pokemons', (event, data) => {
      this.setState({ monsters: this.getNewMonsters(data, this.state.sortBy, this.state.sortDir) })
    })

    const usernameH = document.getElementById('username-h')

    const playerInfo = ipcRenderer.sendSync('get-player-info')
    if (playerInfo.success) {
      setBackgroundImage(playerInfo.player_data.team)

      usernameH.innerHTML = playerInfo.player_data.username
    } else {
      ipcRenderer.send('error-message', 'Failed in retrieving player info.  Please restart.')
    }

    ipcRenderer.send('table-did-mount')
  },

  render() {
    // <!--<h5 id="pokestorage-h"></h5>
    // <h5 id="bagstorage-h"></h5>-->
    const {
      monsters,
      filterBy,
      sortBy,
      sortDir
    } = this.state

    return (
      <div>
        <header className="header" id="profile-header">
          <p id="username-h"/>
          <p>Status: <span id="status-h" ref="statusH">Idle</span></p>
        </header>

        <div className="container">
          <h1>
            <span>Pokémon</span>
            <span
              className="glyphicon glyphicon-refresh"
              id="refresh-btn"
              onClick={this.handleRefresh}
            />

            <span className="pull-right">
              <input
                type="button"
                className="btn btn-warning"
                id="transfer-btn"
                value="Transfer selected"
                onClick={this._handleTransfer}
              />
              {" "}
              <input
                type="button"
                className="btn btn-danger"
                id="evolve-btn"
                value="Evolve selected"
                onClick={this._handleEvolve}
              />
            </span>
          </h1>

          <div className="row col-md-12">
            <div className="form-group input-group">
              <span className="input-group-addon"><span className="glyphicon glyphicon-search" aria-hidden="true"></span></span>
              <input
                type="text"
                className="form-control"
                placeholder="Search"
                ref="search"
                onChange={this._onFilterChange}
              />
            </div>
          </div>

          <SpeciesTable
            ref="speciesTable"
            monsters={monsters}
            filterBy={filterBy}
            sortBy={sortBy}
            sortDir={sortDir}
            sortSpeciesBy={this.sortSpeciesBy}
            updateSpecies={this.updateSpecies}
            getSortedPokemon={this.getSortedPokemon}
          />
        </div>

        <div
          className="modal fade"
          id="detailModal"
          tabIndex="-1"
          role="dialog"
          aria-labelledby="detailModalLabel"
          ref="detailModal"
        ></div>
      </div>
    )
  },

  updateMonster(pokemon, index, speciesIndex) {
    this.updateSpecies(speciesIndex, (speciesAtIndex) => {
      return { // make sure we sort the new pokemon index now that we updated it
        pokemon: this.getSortedPokemon(Object.assign({}, speciesAtIndex, {
          pokemon: Immutable.array.set(speciesAtIndex.pokemon, index, pokemon)
        }))
      }
    })
    console.log('UPDATING monsters with', pokemon)
  },

  updateSpecies(index, updater) {
    const speciesAtIndex = this.state.monsters.species[index]
    const updatedSpecies = Object.assign({}, speciesAtIndex, updater(speciesAtIndex))

    const updatedMonsters = Object.assign({}, this.state.monsters, {
      species: Immutable.array.set(this.state.monsters.species, index, updatedSpecies)
    })

    this.setState({
      monsters: updatedMonsters
    })
  },

  _onFilterChange(event) {
    this.setState({
      filterBy: String(event.target.value).toLowerCase()
    })
  },

  handleRefresh() {
    ipcRenderer.send('get-players-pokemons', 'async')
  },

  _handleTransfer () {
    if (runningCheck()) return

    const selectedPokemon = this.refs.speciesTable.getPokemonChecked()

    const filteredPokemon = []

    selectedPokemon.map((p) => {
      if (!p.favorite ? -1 : 0) {
        return filteredPokemon.push(p)
      }
    })


    if (ipcRenderer.sendSync('confirmation-dialog', 'transfer').success) {
      running = true
      filteredPokemon.forEach((pokemon, index) => {
        ipcRenderer.send('transfer-pokemon', String(pokemon.id), index * randomDelay(2, 3))
      })
      this._countDown('Transfer', filteredPokemon.length * 2.5)
    }
  },

  _handleEvolve () {
    if (runningCheck()) return

    const selectedPokemon = this.refs.speciesTable.getPokemonChecked()

    if (ipcRenderer.sendSync('confirmation-dialog', 'evolve').success) {
      running = true
      selectedPokemon.forEach((pokemon, index) => {
        ipcRenderer.send('evolve-pokemon', String(pokemon.id), index * randomDelay(25, 30))
      })
      this._countDown('Evolve', selectedPokemon.length * 27.5)
    }
  },

  _countDown(method, index) {
    const { statusH } = this.refs

    countDown(method, index, statusH, () => {
      ipcRenderer.send('information-dialog', 'Complete!', `Finished ${method}`)
      this.handleRefresh()
    })
  },

  getSortedSpecies(monsters, sortBy, sortDir) {
    const species = monsters.species.slice()

    if (COLUMN_SORT_AS_NUM[sortBy]) {
      Organize.sortAsNumber(species, sortBy, sortDir)
    } else {
      Organize.sortAsString(species, sortBy, sortDir)
    }

    return species
  },

  getSortedPokemon(specie, sortBy, sortDir) {
    const pokemon = specie.pokemon.slice()

    if (!sortBy && !sortDir) {
      // Hacky way of retrieving the current sort state of species.jsx
      if (this.refs.speciesTable) {
        const sortState = this.refs.speciesTable.getSortState(specie)
        sortBy = sortState.sortBy
        sortDir = sortState.sortDir
      } else {
        sortBy = 'cp'
        sortDir = 'DESC'
      }
    }

    if (COLUMN_SORT_AS_NUM[sortBy]) {
      Organize.sortAsNumber(pokemon, sortBy, sortDir)
    } else {
      Organize.sortAsString(pokemon, sortBy, sortDir)
    }

    return pokemon
  },

  sortSpeciesBy(newSortBy) {
    let {
      sortBy,
      sortDir
    } = this.state

    let newSortDir = null

    if (newSortBy === sortBy) {
      newSortDir = sortDir === 'ASC' ? 'DESC' : 'ASC'
    } else {
      newSortDir = 'DESC'
    }

    const monsters = Object.assign({}, this.state.monsters, {
      species: this.getSortedSpecies(this.state.monsters, newSortBy, newSortDir)
    })

    this.setState({
      sortDir: newSortDir,
      sortBy: newSortBy,
      monsters
    })
  },

  getNewMonsters(monsters, sortBy, sortDir) {
    const sortedSpecies = this.getSortedSpecies(monsters, sortBy, sortDir)

    // Mutates, but it is okay because we sliced/sorted above ^
    sortedSpecies.forEach(specie => {
      specie.pokemon = this.getSortedPokemon(specie)
    })

    return Object.assign({}, monsters, {
      species: sortedSpecies
    })
  }
})

export default Table