import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  QueryList,
  ViewChildren,
} from '@angular/core';
import { FieldArrayType, FormlyFieldConfig } from '@ngx-formly/core';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { ProductContextDirective } from 'ish-core/directives/product-context.directive';
import { ProductContextFacade } from 'ish-core/facades/product-context.facade';

@Component({
  selector: 'ish-quickorder-repeat-form',
  templateUrl: './quickorder-repeat-form.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickorderRepeatFormComponent extends FieldArrayType implements AfterViewInit, OnDestroy {
  @ViewChildren(ProductContextDirective) contexts: QueryList<{ context: ProductContextFacade }>;

  private destroy$ = new Subject();

  constructor(private cdRef: ChangeDetectorRef) {
    super();
  }

  ngAfterViewInit() {
    this.updateContexts();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  addMultipleRows(rows: number) {
    for (let i = 0; i < rows; i++) {
      this.add(this.model.length, { sku: '', quantity: 1 });
    }
    this.updateContexts();
  }

  updateContexts() {
    this.cdRef.detectChanges();
    this.contexts.forEach((context: { context: ProductContextFacade }, index) => {
      this.addContextToTemplateOptions(context.context, this.field.fieldGroup[index].fieldGroup[0]);

      context.context.connect(
        'sku',
        this.field.fieldGroup[index].fieldGroup[0].formControl.valueChanges.pipe(debounceTime(500))
      );
    });
  }

  private addContextToTemplateOptions(context: ProductContextFacade, field: FormlyFieldConfig) {
    field.templateOptions = { ...field.templateOptions, context };
  }
}
