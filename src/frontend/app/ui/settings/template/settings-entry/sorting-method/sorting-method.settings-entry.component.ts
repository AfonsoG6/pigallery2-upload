import {Component} from '@angular/core';
import {
  ControlValueAccessor,
  NG_VALIDATORS,
  NG_VALUE_ACCESSOR,
  UntypedFormControl,
  ValidationErrors,
  Validator
} from '../../../../../../../../node_modules/@angular/forms';
import {SortingByTypes, SortingMethod} from '../../../../../../../common/entities/SortingMethods';
import {enumToTranslatedArray} from '../../../../EnumTranslations';
import {AutoCompleteService} from '../../../../gallery/search/autocomplete.service';
import {RouterLink} from '../../../../../../../../node_modules/@angular/router';
import {forwardRef} from '../../../../../../../../node_modules/@angular/core';

@Component({
  selector: 'app-settings-entry-sorting-method',
  templateUrl: './sorting-method.settings-entry.component.html',
  styleUrls: ['./sorting-method.settings-entry.component.css'],
  providers: [
    AutoCompleteService,
    RouterLink,
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SortingMethodSettingsEntryComponent),
      multi: true,
    },
    {
      provide: NG_VALIDATORS,
      useExisting: forwardRef(() => SortingMethodSettingsEntryComponent),
      multi: true,
    },
  ],
})
export class SortingMethodSettingsEntryComponent
  implements ControlValueAccessor, Validator {

  public sortingMethod: SortingMethod;
  public readonly sortingByTypes = enumToTranslatedArray(SortingByTypes);

  public onTouched(): void {
    //ignoring
  }

  public writeValue(obj: SortingMethod): void {
    this.sortingMethod = obj;
  }

  registerOnChange(fn: (_: unknown) => void): void {
    this.propagateChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.propagateTouch = fn;
  }

  public onChange(): void {
    this.propagateChange(this.sortingMethod);
  }

  validate(control: UntypedFormControl): ValidationErrors {
    return {required: true};
  }


  private propagateChange = (_: SortingMethod): void => {
    //ignoring
  };

  private propagateTouch = (_: never): void => {
    //ignoring
  };

  protected readonly SortingByTypes = SortingByTypes;

  setSortingBy(key: SortingByTypes): void {
    this.sortingMethod.method = key;
    if (key == SortingByTypes.random) {
      this.sortingMethod.ascending = null;
    } else if (this.sortingMethod.ascending == null) {
      this.sortingMethod.ascending = true;
    }
    this.onChange();
  }

  setSortingAscending(ascending: boolean): void {
    this.sortingMethod.ascending = ascending;
    this.onChange();
  }
}
