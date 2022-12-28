import {AfterViewInit, Component, ElementRef, OnInit, QueryList, ViewChildren,} from '@angular/core';
import {AuthenticationService} from '../../model/network/authentication.service';
import {UserRoles} from '../../../../common/entities/UserDTO';
import {NotificationService} from '../../model/notification.service';
import {NotificationType} from '../../../../common/entities/NotificationDTO';
import {NavigationService} from '../../model/navigation.service';
import {ISettingsComponent} from '../settings/_abstract/ISettingsComponent';
import {PageHelper} from '../../model/page.helper';
import {SettingsService} from '../settings/settings.service';
import {CookieNames} from '../../../../common/CookieNames';
import {CookieService} from 'ngx-cookie-service';
import {ConfigPriority} from '../../../../common/config/public/ClientConfig';
import {Utils} from '../../../../common/Utils';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
})
export class AdminComponent implements OnInit, AfterViewInit {
  @ViewChildren('setting') settingsComponents: QueryList<ISettingsComponent>;
  @ViewChildren('setting', {read: ElementRef})
  settingsComponentsElemRef: QueryList<ElementRef>;
  contents: ISettingsComponent[] = [];
  configPriorities: { key: number; value: string; }[];
  public readonly ConfigPriority = ConfigPriority;

  constructor(
    private authService: AuthenticationService,
    private navigation: NavigationService,
    public notificationService: NotificationService,
    public settingsService: SettingsService,
  ) {
    this.configPriorities = Utils.enumToArray(ConfigPriority);
  }

  ngAfterViewInit(): void {
    setTimeout(() => (this.contents = this.settingsComponents.toArray()), 0);
  }

  scrollTo(i: number): void {
    PageHelper.ScrollY =
      this.settingsComponentsElemRef
        .toArray()[i].nativeElement.getBoundingClientRect().top + PageHelper.ScrollY;
  }

  ngOnInit(): void {
    if (
      !this.authService.isAuthenticated() ||
      this.authService.user.value.role < UserRoles.Admin
    ) {
      this.navigation.toLogin();
      return;
    }
  }

  public getCss(type: NotificationType): string {
    switch (type) {
      case NotificationType.error:
        return 'danger';
      case NotificationType.warning:
        return 'warning';
      case NotificationType.info:
        return 'info';
    }
    return 'info';
  }
}



