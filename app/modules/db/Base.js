import { AsyncStorage } from 'react-native'

export default class Base {

  getItem = AsyncStorage.getItem

  setItem = AsyncStorage.setItem

  removeItem = AsyncStorage.removeItem

}
