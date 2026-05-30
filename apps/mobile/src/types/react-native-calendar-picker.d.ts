declare module 'react-native-calendar-picker' {
  import { Component } from 'react'

  interface CalendarPickerProps {
    onDateChange?: (date: Date, type?: string) => void
    selectedStartDate?: Date
    selectedEndDate?: Date
    startFromMonday?: boolean
    minDate?: Date
    maxDate?: Date
    weekdays?: string[]
    months?: string[]
    previousTitle?: string
    nextTitle?: string
    selectedDayColor?: string
    selectedDayTextColor?: string
    todayBackgroundColor?: string
    todayTextStyle?: object
    textStyle?: object
    width?: number
    height?: number
    allowRangeSelection?: boolean
    allowBackwardRangeSelect?: boolean
    customDatesStyles?: Array<{ date: Date; style?: object; textStyle?: object; containerStyle?: object }>
    scaleFactor?: number
    enableSwipe?: boolean
    enableDateChange?: boolean
    restrictMonthNavigation?: boolean
    dayShape?: 'circle' | 'square'
    headingLevel?: number
    selectMonthTitle?: string
    selectYearTitle?: string
    [key: string]: unknown
  }

  export default class CalendarPicker extends Component<CalendarPickerProps> {}
}
